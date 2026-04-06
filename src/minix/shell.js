import { A, c, dedent, wrap, parseFlags, loadBin } from "./utils.js"
import { runPythonAsync } from "./python-runner.js"

/**
 * Metacircular Shell for Minix JS
 */
export class Shell {
    constructor(vfs, term) {
        this.vfs = vfs
        this.term = term
        this.env = new Map([
            ["HOME", "/home/user"],
            ["USER", "user"],
            ["HOSTNAME", "vm"],
            ["SHELL", "/bin/sh"],
            ["TERM", "xterm-256color"],
            ["PATH", "/bin"],
        ])
        this.history = []
        this.histIdx = -1
        this.buf = ""
        this.cur = 0
        this.running = false
        this.interrupted = false
        this.shellDataDisposable = null
        this.stdoutHistory = []

        // Callback hooks for the terminal manager (index.js)
        this.onPythonInit = null // () => void
        this.onPythonCleanup = null // () => void
        this.onReadLine = null // async () => string
        this.onAfterCommand = null // () => void
    }

    serialize() {
        return {
            cwd: this.vfs.pathOf(this.vfs.cwd),
            env: Object.fromEntries(this.env.entries()),
            history: [...this.history],
            stdoutHistory: [...this.stdoutHistory],
        }
    }

    get _prompt() {
        const p = this.vfs.pathOf(this.vfs.cwd).replace(/^\/home\/user/, "~")
        return `${c("bGreen", "user@vm")}:${c("bBlue", p)}$ `
    }

    prompt() {
        if (this.term.buffer.active.cursorX > 0) this.term.write("\r\n")
        this.term.write(this._prompt)
    }

    write(s) {
        this.term.write(s)
    }

    writeln(s = "") {
        this.term.write(s + "\r\n")
    }

    err(cmd, msg) {
        this.writeln(`${c("bRed", cmd + ":")} ${msg}`)
    }

    handleData(data) {
        if (this.running) {
            if (data === "\x03") {
                this.interrupted = true
                this.write("^C")
            }
            return
        }

        if (data.startsWith("\x1b[")) {
            switch (data) {
                case "\x1b[A":
                case "\x1bOA":
                    this._hist(1)
                    break
                case "\x1b[B":
                case "\x1bOB":
                    this._hist(-1)
                    break
                case "\x1b[C":
                    if (this.cur < this.buf.length) {
                        this.cur++
                        this.write("\x1b[C")
                    }
                    break
                case "\x1b[D":
                    if (this.cur > 0) {
                        this.cur--
                        this.write("\x1b[D")
                    }
                    break
                case "\x1b[H":
                    this._moveTo(0)
                    break
                case "\x1b[F":
                    this._moveTo(this.buf.length)
                    break
                case "\x1b[3~":
                    if (this.cur < this.buf.length) {
                        this.buf = this.buf.slice(0, this.cur) + this.buf.slice(this.cur + 1)
                        this._redraw()
                    }
                    break
            }
            return
        }

        switch (data) {
            case "\r":
                this._enter()
                break
            case "\x7f":
            case "\x08":
                if (this.cur > 0) {
                    this.buf = this.buf.slice(0, this.cur - 1) + this.buf.slice(this.cur)
                    this.cur--
                    this._redraw()
                }
                break
            case "\x03":
                this.writeln("^C")
                this.buf = ""
                this.cur = 0
                this.prompt()
                break
            case "\x0c":
                this.term.clear()
                break
            case "\x01":
                this._moveTo(0)
                break
            case "\x05":
                this._moveTo(this.buf.length)
                break
            case "\t":
                this._complete()
                break
            default:
                const printable = [...data].filter(ch => ch >= " ").join("")
                if (!printable) return
                this.buf = this.buf.slice(0, this.cur) + printable + this.buf.slice(this.cur)
                this.cur += printable.length
                this.cur === this.buf.length ? this.write(printable) : this._redraw()
        }
    }

    _redraw() {
        this.term.write("\r\x1b[K" + this._prompt + this.buf)
        if (this.buf.length > this.cur) this.term.write(`\x1b[${this.buf.length - this.cur}D`)
    }

    _moveTo(p) {
        const d = p - this.cur
        if (d < 0) this.term.write(`\x1b[${-d}D`)
        else if (d > 0) this.term.write(`\x1b[${d}C`)
        this.cur = p
    }

    _hist(d) {
        this.histIdx = Math.max(-1, Math.min(this.history.length - 1, this.histIdx + d))
        this.buf = this.histIdx >= 0 ? this.history[this.histIdx] : ""
        this.cur = this.buf.length
        this._redraw()
    }

    _enter() {
        this.write("\r\n")
        const line = this.buf
        this.buf = ""
        this.cur = 0
        if (line.trim()) {
            this.history.unshift(line)
            this.histIdx = -1
        }
        this.running = true
        this.interrupted = false
        this.exec(line).finally(() => {
            this.running = false
            this.prompt()
            if (this.onAfterCommand) this.onAfterCommand()
        })
    }

    _complete() {
        const tok = this.buf.slice(0, this.cur).split(/\s+/).pop()
        const isCmd = !this.buf.slice(0, this.cur).trim().includes(" ")
        const binNode = this.vfs.resolve("/bin")

        let n
        let nodes = isCmd
            ? [...binNode.children.keys()].filter(k => k.startsWith(tok))
            : (n = this.vfs.resolve(tok) || this.vfs.cwd).type === "dir"
              ? [...n.children.keys()].filter(k => k.startsWith(tok))
              : []
        if (nodes.length === 1) {
            const childNode = n?.children.get(nodes[0])
            const add = nodes[0].slice(tok.length) + (childNode?.type === "dir" ? "/" : "")
            this.buf = this.buf.slice(0, this.cur) + add + this.buf.slice(this.cur)
            this.cur += add.length
            this._redraw()
        } else if (nodes.length > 1) {
            this.writeln("\r\n" + nodes.join("  "))
            this.term.write(this._prompt + this.buf)
        }
    }

    async exec(line) {
        const pipes = line.split(/(?<!\\)\|/).map(s => s.trim())
        let stdin = null
        for (const seg of pipes) {
            stdin = await this.runSeg(seg, stdin)
            if (stdin === null && pipes.length > 1) {
                this.err("pipe", "broken pipe")
                break
            }
        }
        if (stdin && typeof stdin === "string") {
            this.write(stdin.replace(/\n/g, "\r\n"))
            this.stdoutHistory.push(stdin)
        }
    }

    async runSeg(line, stdin) {
        const tokens = []
        let cur = "",
            inS = false,
            inD = false
        for (const ch of line) {
            if (ch === "'" && !inD) {
                inS = !inS
                continue
            }
            if (ch === '"' && !inS) {
                inD = !inD
                continue
            }
            if (ch === " " && !inS && !inD) {
                if (cur) {
                    tokens.push(cur)
                    cur = ""
                }
                continue
            }
            cur += ch
        }
        if (cur) tokens.push(cur)
        const args = tokens.map(t =>
            t.replace(/\$(\w+|\{.*?\})/g, (_, v) => this.env.get(v.replace(/[{}]/g, "")) || ""),
        ).flatMap(arg => {
            const match = arg.match(/^-([a-zA-Z])(\d+)$/)
            return match ? [`-${match[1]}`, match[2]] : [arg]
        })

        let outFile = null,
            append = false,
            cleanArgs = []
        for (let i = 0; i < args.length; i++) {
            if (args[i] === ">>") {
                outFile = args[++i]
                append = true
            } else if (args[i] === ">") {
                outFile = args[++i]
                append = false
            } else cleanArgs.push(args[i])
        }

        const [cmd, ...rest] = cleanArgs
        if (!cmd) return stdin

        if (cmd === "cd") {
            const target = rest[0]?.replace(/^~/, this.env.get("HOME")) || this.env.get("HOME")
            const node = this.vfs.resolve(target)
            if (!node || node.type !== "dir") this.err("cd", `not a directory: ${target}`)
            else {
                this.vfs.cwd = node
                this.env.set("PWD", this.vfs.pathOf(node))
            }
            return null
        }
        if (cmd === "export") {
            rest.forEach(a => {
                const [k, v] = a.split("=")
                if (v) this.env.set(k, v)
            })
            return null
        }
        if (cmd === "exit") {
            this.writeln("logout")
            return null
        }

        const binNode = this.vfs.resolve(`/bin/${cmd}`)
        if (!binNode || binNode.type !== "file") {
            this.err(cmd, "command not found")
            return null
        }

        try {
            const fn = loadBin(binNode.content)
            if (typeof fn !== "function") throw new Error("Invalid executable")

            const ctx = {
                env: this.env,
                fs: this.vfs,
                term: this.term,
                A,
                c,
                dedent,
                wrap,
                parseFlags,
                runPythonAsync,
                sh: this,
                shellDataDisposable: this.shellDataDisposable,
                stdin: stdin ? stdin.replace(/\r\n/g, "\n") : null,
                signal: { interrupted: () => this.interrupted },
                mountPythonInput: this.onPythonInit,
                unmountPythonInput: this.onPythonCleanup,
                readLine: this.onReadLine,
                async wait(ms) {
                    await new Promise(r => setTimeout(r, ms))
                },
                // Pass mounting element in ctx for sl etc.
                element: this.term.element?.closest('.minix-shell') || this.term.element // Fallback
            }

            const out = await fn(rest, ctx)

            if (outFile) {
                const text = typeof out === "string" ? out : ""
                const existing = this.vfs.resolve(outFile)
                this.vfs.write(outFile, append && existing ? existing.content + text : text)
                return null
            }
            return out
        } catch (e) {
            this.err(cmd, e.message)
            return null
        }
    }
}
