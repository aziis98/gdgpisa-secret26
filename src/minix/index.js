import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit"
import "xterm/css/xterm.css"

import { VFS } from "./vfs.js"
import { Shell } from "./shell.js"
import { A, c, parseFlags, dedent, createBinary } from "./utils.js"
import { runPythonAsync } from "./python-runner.js"

// System Assets
import vocabRaw from "./home/vocab.json?raw"
import inferRaw from "./home/infer.py?raw"
import modelWeightsRaw from "./home/model_weights.json?raw"

export class MinixEnv {
    constructor(term, vfs, sh, fit) {
        this.term = term
        this.vfs = vfs
        this.sh = sh
        this.fit = fit
    }

    serialize() {
        return {
            vfs: this.vfs.serialize(),
            shell: this.sh.serialize(),
        }
    }
}

export async function mount(element, options = {}) {
    if (typeof element === "string") {
        element = document.querySelector(element)
    }

    const vfs = new VFS()
    
    // User Context
    vfs.mk("/home/user/devbot/vocab.json", vocabRaw)
    vfs.mk("/home/user/devbot/infer.py", inferRaw)
    vfs.mk("/home/user/devbot/model_weights.json", modelWeightsRaw)
    vfs.mk("/home/user/hello.py", dedent(`
        print("Hello from Python!")
        name = input("Your name? ")
        print(f"Hi, {name}")
    `))

    vfs.cwd = vfs.resolve("/home/user")

    const term = new Terminal({
        fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
        fontSize: 14,
        lineHeight: 1.4,
        cursorBlink: true,
        convertEol: false,
        scrollback: 5000,
        theme: {
            background: "#000000",
            foreground: "#e6edf3",
            cursor: "#7ee787",
            cursorAccent: "#000000",
            black: "#21262d",
            red: "#ff7b72",
            green: "#3fb950",
            yellow: "#d29922",
            blue: "#388bfd",
            magenta: "#a371f7",
            cyan: "#39c5cf",
            white: "#b1bac4",
            brightBlack: "#6e7681",
            brightRed: "#ffa198",
            brightGreen: "#56d364",
            brightYellow: "#e3b341",
            brightBlue: "#79c0ff",
            brightMagenta: "#d2a8ff",
            brightCyan: "#56d364",
            brightWhite: "#f0f6fc",
        },
        ...options.terminal,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(element)
    fit.fit()

    window.addEventListener("resize", () => fit.fit())

    const sh = new Shell(vfs, term)
    sh.env.set("PWD", "/home/user")

    // --- Python I/O Management ---
    let pythonInputBuffer = ""
    let pythonInputResolve = null
    let pythonDataDisposable = null
    let shellDataDisposable = term.onData(d => sh.handleData(d))
    sh.shellDataDisposable = shellDataDisposable

    const mountPythonInput = () => {
        if (shellDataDisposable) {
            shellDataDisposable.dispose()
            shellDataDisposable = null
            sh.shellDataDisposable = null
        }

        pythonInputBuffer = ""
        pythonInputResolve = null

        pythonDataDisposable = term.onData(data => {
            if (pythonInputResolve === null) return

            if (data === "\r") {
                term.write("\r\n")
                const input = pythonInputBuffer
                pythonInputBuffer = ""
                pythonInputResolve(input)
                pythonInputResolve = null
            } else if (data === "\x7f" || data === "\x08") {
                if (pythonInputBuffer.length > 0) {
                    pythonInputBuffer = pythonInputBuffer.slice(0, -1)
                    term.write("\x08 \x08")
                }
            } else if (data === "\x03") {
                term.write("\r\n")
                pythonInputBuffer = ""
                pythonInputResolve("")
                pythonInputResolve = null
            } else if (data === "\x0c") {
                term.clear()
            } else if (data >= " ") {
                pythonInputBuffer += data
                term.write(data)
            }
        })
    }

    const unmountPythonInput = () => {
        if (pythonDataDisposable) {
            pythonDataDisposable.dispose()
            pythonDataDisposable = null
        }
        pythonInputBuffer = ""
        pythonInputResolve = null
        shellDataDisposable = term.onData(d => sh.handleData(d))
        sh.shellDataDisposable = shellDataDisposable
    }

    const readLineAsync = async () => {
        return await new Promise(resolve => {
            pythonInputResolve = resolve
        })
    }

    sh.onPythonInit = mountPythonInput
    sh.onPythonCleanup = unmountPythonInput
    sh.onReadLine = readLineAsync

    // --- Filesystem Population ---
    
    // Commands
    const bin = vfs._mkdir("bin", vfs.root)
    vfs.root.children.set("bin", bin)

    // System Utilities
    vfs.mk("/bin/ls",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: ls [OPTION]... [FILE]...\nList directory contents.\nOptions:\n  -a          include hidden files\n  -l          use long listing format\n  -h, --help  show this help message\n"
            }
            const { fs, c, parseFlags } = ctx
            const { flags, pos } = parseFlags(args)
            const showAll = flags.has("a"),
                long = flags.has("l")
            const target = pos.length ? pos[0] : "."
            const node = fs.resolve(target)
            if (!node) return "ls: cannot access '" + target + "': No such file or directory\n"
            const list = node.type === "dir" ? [...node.children.values()] : [node]
            const visible = list.filter(n => showAll || !n.name.startsWith("."))
            const fmtName = n =>
                n.type === "dir" ? c("bBlue", n.name + "/") : n.mode & 0o111 ? c("bGreen", n.name) : n.name
            if (!long) return visible.map(fmtName).join("  ") + "\n"
            const fmtMode = n => {
                const t = n.type === "dir" ? "d" : "-"
                const r = v => [(v >> 2) & 1 ? "r" : "-", (v >> 1) & 1 ? "w" : "-", v & 1 ? "x" : "-"].join("")
                return t + r(n.mode >> 6) + r((n.mode >> 3) & 7) + r(n.mode & 7)
            }
            const fmtDate = t => {
                const d = new Date(t)
                const mo = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[d.getMonth()]
                return (
                    mo +
                    " " +
                    String(d.getDate()).padStart(2) +
                    " " +
                    String(d.getHours()).padStart(2, "0") +
                    ":" +
                    String(d.getMinutes()).padStart(2, "0")
                )
            }
            const maxSz = Math.max(
                0,
                ...visible.map(n => String(n.type === "file" ? n.content.length : 0).length),
            )
            return (
                visible
                    .map(n => {
                        const sz = String(n.type === "file" ? n.content.length : 0).padStart(maxSz)
                        return fmtMode(n) + " 1 user user " + sz + " " + fmtDate(n.mtime) + " " + fmtName(n)
                    })
                    .join("\n") + "\n"
            )
        })
    )

    vfs.mk(
        "/bin/cat",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: cat [FILE]...\nConcatenate files and print to stdout.\n  -h, --help  show this help message\n"
            }
            const { fs, stdin } = ctx
            if (!args.length) return stdin || ""
            return args
                .map(f => {
                    const n = fs.resolve(f)
                    return !n
                        ? "cat: " + f + ": No such file\n"
                        : n.type === "dir"
                          ? "cat: Is directory\n"
                          : n.content
                })
                .join("")
        }),
    )

    vfs.mk(
        "/bin/echo",
        createBinary(args => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: echo [STRING]...\nPrint arguments to stdout.\n  -h, --help  show this help message\n"
            }
            return args.join(" ").replace(/\\n/g, "\n") + "\n"
        }),
    )

    vfs.mk(
        "/bin/clear",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: clear\nClear the terminal.\n  -h, --help  show this help message\n"
            }
            ctx.term.clear()
            return null
        }),
    )

    vfs.mk(
        "/bin/pwd",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: pwd\nPrint the current working directory.\n  -h, --help  show this help message\n"
            }
            return ctx.env.get("PWD") + "\n"
        }),
    )

    vfs.mk(
        "/bin/whoami",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: whoami\nPrint the current user.\n  -h, --help  show this help message\n"
            }
            return ctx.env.get("USER") + "\n"
        }),
    )

    vfs.mk(
        "/bin/date",
        createBinary(args => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: date\nPrint the current date and time.\n  -h, --help  show this help message\n"
            }
            return new Date().toString() + "\n"
        }),
    )

    vfs.mk(
        "/bin/help",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: help\nDisplay available commands.\n  -h, --help  show this help message\n"
            }
            const progs = [...ctx.fs.resolve("/bin").children.keys()]
            return ctx.c("bold", "Available commands:\n") + progs.join("  ") + "\n"
        }),
    )

    vfs.mk(
        "/bin/sl",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: sl\nOpposite of ls.\n  -h, --help  show this help message\n"
            }
            // Use the provided element from context for the animation
            const target = ctx.element
            target?.classList.add("sl-rotate")
            setTimeout(() => target?.classList.remove("sl-rotate"), 2000)
            return null
        }),
    )
    
    // Add CSS for sl animation if not present (though user said no need to update styles, this is logic-driven)
    if (!document.getElementById("minix-styles")) {
        const style = document.createElement("style")
        style.id = "minix-styles"
        style.innerHTML = `
            @keyframes rotate360 {
                from { transform: rotateZ(0deg); }
                to { transform: rotateZ(360deg); }
            }
            .sl-rotate {
                transform-origin: center;
                animation: rotate360 2s linear 1;
            }
        `
        document.head.appendChild(style)
    }

    vfs.mk(
        "/bin/uname",
        createBinary(args => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: uname [OPTION]\nPrint system information.\nOptions:\n  -a          print all information\n  -h, --help  show this help message\n"
            }
            return args[0] === "-a" 
                ? "MinixJS 0.0.1 vm js fake/linux + pyodide\n" 
                : "MinixJS\n"
        })
    )

    vfs.mk(
        "/bin/find",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: find [PATH] [OPTION]...\nSearch for files in a directory hierarchy.\nOptions:\n  -name PATTERN  match files by name\n  -type TYPE     match files by type (f=file, d=directory)\n  -h, --help     show this help message\n"
            }
            const { fs } = ctx
            const root = args[0] && !args[0].startsWith("-") ? args[0] : "."
            const nameIdx = args.indexOf("-name"),
                typeIdx = args.indexOf("-type")
            const namePat = nameIdx >= 0 ? args[nameIdx + 1] : null
            const typeFilter = typeIdx >= 0 ? args[typeIdx + 1] : null
            const startNode = fs.resolve(root)
            if (!startNode) return "find: " + root + ": No such file or directory\n"
            const glob = (pat, str) =>
                new RegExp(
                    "^" +
                        pat
                            .replace(/[.+^{}$()|[\]\\]/g, "\\$&")
                            .replace(/\*/g, ".*")
                            .replace(/\?/g, ".") +
                        "$",
                ).test(str)
            const results = []
            const walk = (node, path) => {
                const nameOk = !namePat || glob(namePat, node.name)
                const typeOk =
                    !typeFilter ||
                    (typeFilter === "f" && node.type === "file") ||
                    (typeFilter === "d" && node.type === "dir")
                if (nameOk && typeOk) results.push(path)
                if (node.type === "dir") {
                    for (const [name, child] of node.children) {
                        walk(child, path === "/" ? "/" + name : path + "/" + name)
                    }
                }
            }
            if (startNode.type === "dir") {
                if (!namePat && !typeFilter) results.push(root)
                for (const [name, child] of startNode.children) {
                    walk(child, root === "/" ? "/" + name : root + "/" + name)
                }
            } else {
                walk(startNode, root)
            }
            return results.join("\n") + "\n"
        })
    )

    vfs.mk(
        "/bin/grep",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: grep [OPTION]... PATTERN [FILE]...\nSearch for lines matching a pattern.\nOptions:\n  -i          ignore case\n  -v          invert match (show non-matching lines)\n  -n          print line numbers\n  -r, -R      search recursively\n  -h, --help  show this help message\n"
            }
            const { fs, c, parseFlags, stdin } = ctx
            const { flags, pos } = parseFlags(args)
            const [pattern, ...files] = pos
            if (!pattern) return "grep: missing pattern\n"
            const re = new RegExp(pattern, flags.has("i") ? "i" : "")
            const invert = flags.has("v"),
                lineNums = flags.has("n"),
                recursive = flags.has("r") || flags.has("R")
            const multiFile = files.length > 1 || recursive
            const grepLines = (text, label) => {
                const out = []
                text.split("\n").forEach((line, i) => {
                    const hit = re.test(line)
                    if (hit !== invert) {
                        const pre =
                            (label ? c("bMagenta", label) + ":" : "") +
                            (lineNums ? c("yellow", String(i + 1)) + ":" : "")
                        out.push(pre + (invert ? line : line.replace(re, m => c("bRed", m))))
                    }
                })
                return out
            }
            const results = []
            const grepNode = (node, path) => {
                if (node.type === "file") results.push(...grepLines(node.content, multiFile ? path : null))
                else if (recursive && node.type === "dir") {
                    for (const [name, child] of node.children) {
                        grepNode(child, path === "/" ? "/" + name : path + "/" + name)
                    }
                }
            }
            if (!files.length) {
                if (stdin) results.push(...grepLines(stdin, null))
            } else {
                for (const f of files) {
                    const node = fs.resolve(f)
                    if (!node) {
                        results.push("grep: " + f + ": No such file or directory")
                        continue
                    }
                    grepNode(node, f)
                }
            }
            return results.join("\n") + (results.length ? "\n" : "")
        })
    )

    vfs.mk(
        "/bin/man",
        createBinary((args, ctx) => {
            const { c, wrap } = ctx
            const width = ctx.term.cols || 80
            
            const title = "system manual"
            const sideLen = Math.floor((width - title.length - 2) / 2)
            const header = c("bBlack", "━".repeat(sideLen) + " ") + 
                         c("bold", title) + 
                         c("bBlack", " " + "━".repeat(width - sideLen - title.length - 2))

            const actualWidth = sideLen * 2 + title.length + 2

            // I clearly used an LLM for coloring this man page
            const body = `
                MinixJS is a small ${c("bGreen", "metacircular")} ${c("strike", "mock")} terminal environment running entirely in the browser.

                The system integrates ${c("bCyan", "Pyodide")} for a complete Python3 runtime. This is required for ${c("bYellow", "infer.py")}, which uses Karpathy's microGPT architecture for a zero-dependency Python implementation for LLM inference.

                Binaries in ${c("bBlue", "/bin/")} are modular JS files following a simple functional schema: ${c("bold", "(args, ctx) => string | Promise<string>")}. Minimal example:

                    ${c("bRed", "export")} ${c("bRed", "default")} (${c("bBlue", "args")}, ${c("bBlue", "ctx")}) ${c("bold", "=>")} {
                        ${c("bRed", "return")} ${c("bGreen", "\"Hello \"")} + ${c("bBlue", "args")}[${c("bMagenta", "0")}];
                    }
                
                This was just made for fun, initially I hoped of using Fabrice Bellard's JSLinux to run a real linux kernel in the browser, but for reasons¹ I couldn't easily add python support to it. So I decided to make this fake terminal in pure js using ${c("bBlue", "xterm.js")}. I think I'll publish this with the microgpt training code on ${c("bBlue", "GitHub")} after the event.
                ${" ".repeat(actualWidth - "by @aziis98".length)}by ${c("bMagenta", "@aziis98")}
                ${c("dim", `¹: Feel free to ask me at "birrata" if you want to know more`)}
            `
            return `${header}\n${wrap(body, actualWidth)}\n`
        })
    )

    vfs.mk(
        "/bin/head",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: head [OPTION]... [FILE]...\nPrint the first 10 lines of each FILE to standard output.\nOptions:\n  -n NUM      print the first NUM lines instead of the first 10\n  -h, --help  display this help and exit\n"
            }
            const { parseFlags, fs, stdin } = ctx
            const { flags, pos } = parseFlags(args)
            let n = 10
            let files = pos
            if (flags.has("n")) {
                n = parseInt(pos[0]) || 10
                files = pos.slice(1)
            }
            const headLines = (text) => text.split("\n").slice(0, n).join("\n") + "\n"
            if (!files.length) return headLines(stdin || "")
            return files.map(f => {
                const node = fs.resolve(f)
                if (!node || node.type !== "file") return `head: ${f}: No such file\n`
                return headLines(node.content)
            }).join("")
        })
    )

    vfs.mk(
        "/bin/tail",
        createBinary((args, ctx) => {
            if (args.includes("-h") || args.includes("--help")) {
                return "Usage: tail [OPTION]... [FILE]...\nPrint the last 10 lines of each FILE to standard output.\nOptions:\n  -n NUM      print the last NUM lines instead of the last 10\n  -h, --help  display this help and exit\n"
            }
            const { parseFlags, fs, stdin } = ctx
            const { flags, pos } = parseFlags(args)
            let n = 10
            let files = pos
            if (flags.has("n")) {
                n = parseInt(pos[0]) || 10
                files = pos.slice(1)
            }
            const tailLines = (text) => {
                const lines = text.split("\n")
                return lines.slice(Math.max(0, lines.length - n)).join("\n") + "\n"
            }
            if (!files.length) return tailLines(stdin || "")
            return files.map(f => {
                const node = fs.resolve(f)
                if (!node || node.type !== "file") return `tail: ${f}: No such file\n`
                return tailLines(node.content)
            }).join("")
        })
    )
    vfs.mk(
        "/bin/python",
        createBinary(async (args, ctx) => {
            const { c } = ctx
            
            // Only show Python's help if it's the very first argument and no script is provided
            if (args.length === 1 && (args[0] === "-h" || args[0] === "--help")) {
                return "Usage: python [OPTIONS] [FILE] [ARGS]...\nRun Python code.\nOptions:\n  -c CODE     run code string\n  -h, --help  show this help message\n"
            }
            
            const isCodeFlag = args[0] === "-c"
            const code = isCodeFlag ? args[1] : ctx.fs.resolve(args[0])?.content
            if (!code) return "python: missing script or -c\n"

            let scriptName = isCodeFlag ? "-c" : args[0]
            let scriptArgs = isCodeFlag ? args.slice(2) : args.slice(1)

            if (!window.__py) {
                try {
                    if (!window.loadPyodide) {
                        ctx.term.write("Contacting runtime mirrors...\r\n")
                        const resp = await fetch("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js")
                        const scriptText = await resp.text()
                        const s = document.createElement("script")
                        s.text = scriptText
                        document.head.appendChild(s)
                    }

                    ctx.term.write("Initializing runtime components...\r\n")
                    window.__py = await loadPyodide({
                        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
                        stdout: (text) => ctx.term.write(text.replace(/\n/g, "\r\n")),
                        stderr: (text) => ctx.term.write(c("bRed", text).replace(/\n/g, "\r\n"))
                    })

                    ctx.term.write("Python runtime ready.\r\n")
                } catch (e) {
                    ctx.term.write(`${c("bRed", "Initialization failed:")} ${e.message}\r\n`)
                    throw e
                }
            }

            const vfsAdapter = {
                read(path) {
                    const node = ctx.fs.resolve(path)
                    return (node && node.type === "file") ? node.content : null
                },
                write(path, content) { ctx.fs.write(path, content) },
                exists(path) { return ctx.fs.resolve(path) !== null },
            }

            ctx.mountPythonInput()
            try {
                const output = await ctx.runPythonAsync(code, {
                    py: window.__py,
                    vfs: vfsAdapter,
                    stdoutWrite: async text => {
                        ctx.term.write(text.replace(/\n/g, "\r\n"))
                        await new Promise(resolve => setTimeout(resolve, 1))
                    },
                    readLine: ctx.readLine,
                    scriptName,
                    scriptArgs,
                    stdin: ctx.stdin || null,
                })
                return ctx.stdin ? output : null
            } finally {
                ctx.unmountPythonInput()
            }
        }),
    )

    // Welcome Message
    // term.writeln(c("bGreen", "┌───(Linux)───"))
    // term.writeln(c("bGreen", "│") + " Minimal metacircular shell + Python.")
    // term.writeln(c("bGreen", "└───") + c("bBlack", ' type "help" or "python hello.py".'))
    sh.prompt()

    element.addEventListener("click", () => term.focus())
    term.focus()

    return new MinixEnv(term, vfs, sh, fit)
}
