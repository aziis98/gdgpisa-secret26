/**
 * ANSI Escape Codes & Utilities
 */

export const A = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    bBlack: "\x1b[90m",
    bRed: "\x1b[91m",
    bGreen: "\x1b[92m",
    bBlue: "\x1b[94m",
    bMagenta: "\x1b[95m",
}

export const c = (col, s) => A[col] + s + A.reset

export const parseFlags = args => {
    const flags = new Set(),
        pos = []
    for (const a of args) {
        if (a === "--") continue
        if (a.startsWith("--")) flags.add(a.slice(2))
        else if (a.startsWith("-") && a.length > 1) [...a.slice(1)].forEach(f => flags.add(f))
        else pos.push(a)
    }
    return { flags, pos }
}

export const dedent = (text, prefix) => {
    const lines = text.split("\n")
    while (lines.length > 0 && lines[0].trim().length === 0) lines.splice(0, 1)
    while (lines.length > 0 && lines.at(-1).trim().length === 0) lines.splice(-1, 1)
    if (prefix === undefined && lines.length > 0) {
        prefix = lines[0].match(/^\s*/)?.[0] || ""
    }
    return (
        lines.map(line => (line.startsWith(prefix) ? line.slice(prefix.length) : line)).join("\n") +
        (lines.length > 0 ? "\n" : "")
    )
}

export function loadBin(source) {
    const code =
        "const module = { exports: {} };\n" +
        source.replace(/^\s*export\s+default\s+/, "module.exports = ") +
        "\nreturn module.exports;"
    return new Function(code)()
}

export const createBinary = fn => {
    const fnStr = fn.toString()
    const lines = fnStr.split("\n")
    const bodyLinePrefix = lines.map(line => line.match(/^\s*/)?.[0] || "").find(p => p.length > 0) || ""
    return dedent(`export default ${fnStr}`, bodyLinePrefix.slice(0, -4))
}
