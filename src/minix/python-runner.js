/**
 * Python Runner - Virtualized Python execution environment
 */
export async function runPythonAsync(code, context = {}) {
    const {
        py,
        vfs = null,
        stdoutWrite = null,
        readLine = null,
        scriptName = "script.py",
        scriptArgs = [],
        stdin = null,
    } = context
    let outputBuffer = ""

    console.log(
        "[runPythonAsync] Starting with stdoutWrite:",
        !!stdoutWrite,
        "stdin:",
        !!stdin,
        "readLine:",
        !!readLine,
    )

    try {
        // Ensure Pyodide is loaded
        if (!py) {
            if (stdoutWrite) stdoutWrite("Error: Pyodide not initialized\n")
            return "Error: Pyodide not initialized\n"
        }

        // Configure input handling for terminal
        let inputFunc = null
        if (readLine && typeof readLine === "function") {
            console.log("[runPythonAsync] Setting up readLine callback for input")

            inputFunc = async (prompt = "") => {
                console.log("[inputFunc] Prompt:", prompt)
                if (stdoutWrite) stdoutWrite(prompt)
                return await readLine()
            }

            py.globals.set("_input_fn", inputFunc)
        } else if (stdin && typeof stdin === "string") {
            console.log("[runPythonAsync] Setting up piped stdin handler")
            const lines = stdin.split("\n").filter(l => l.length > 0)
            let stdinIndex = 0

            inputFunc = async (prompt = "") => {
                return stdinIndex < lines.length ? lines[stdinIndex++] : ""
            }

            py.globals.set("_input_fn", inputFunc)
        }

        // Configure stdout/stderr handlers
        console.log("[runPythonAsync] Setting up stdout/stderr handlers")
        py.setStdout({
            raw: byteCode => {
                const char = String.fromCharCode(byteCode)
                if (char === "\n") {
                    if (stdoutWrite) stdoutWrite("\n")
                    outputBuffer += char
                } else {
                    if (stdoutWrite) {
                        stdoutWrite(char)
                    }
                    outputBuffer += char
                }
                return 1
            },
            isatty: !!stdoutWrite,
        })

        py.setStderr({
            raw: byteCode => {
                const char = String.fromCharCode(byteCode)
                if (char === "\n") {
                    if (stdoutWrite) stdoutWrite("\n")
                    outputBuffer += char
                } else {
                    if (stdoutWrite) {
                        stdoutWrite(char)
                    }
                    outputBuffer += char
                }
                return 1
            },
            isatty: !!stdoutWrite,
        })

        // Pass VFS read/write/exists functions to Python
        py.globals.set("_fs_read", vfs?.read ? vfs.read.bind(vfs) : null)
        py.globals.set("_fs_write", vfs?.write ? vfs.write.bind(vfs) : null)
        py.globals.set("_fs_exists", vfs?.exists ? vfs.exists.bind(vfs) : null)

        // Pass script arguments to Python (convert to list for proper concatenation)
        py.globals.set("_script_name", scriptName)
        py.globals.set("_script_args", [...scriptArgs])

        // Set up print function callback
        if (stdoutWrite) {
            console.log("[runPythonAsync] Setting up async print callback")
            py.globals.set("_print_fn", async s => stdoutWrite(s))
        }

        // Build Python setup code
        let pythonSetup = `
import sys, io, builtins, re, os
from typing import Any

_original_open = builtins.open
_original_input = builtins.input
_original_exists = os.path.exists

# Set up sys.argv - convert JS array to Python list
sys.argv = [_script_name] + list(_script_args)


class VFSFile:
    def __init__(self, content: str, mode: str = "r"):
        self.content = content
        self.mode = mode
        self.pos = 0
    
    def read(self, size: int = -1) -> str:
        if size == -1:
            result = self.content[self.pos:]
            self.pos = len(self.content)
        else:
            result = self.content[self.pos:self.pos + size]
            self.pos += len(result)
        return result
    
    def readline(self) -> str:
        start = self.pos
        end = self.content.find("\\n", start)
        if end == -1:
            end = len(self.content)
        else:
            end += 1
        self.pos = end
        return self.content[start:end]
    
    def readlines(self) -> list:
        lines = []
        while True:
            line = self.readline()
            if not line:
                break
            lines.append(line)
        return lines
    
    def __enter__(self):
        return self
    
    def __exit__(self, *args):
        pass
    
    def __iter__(self):
        return self
    
    def __next__(self):
        line = self.readline()
        if not line:
            raise StopIteration
        return line

def _vfs_open(path: str, mode: str = "r", **kwargs):
    return VFSFile(_fs_read(path), mode)

builtins.open = _vfs_open

def _vfs_exists(path: str) -> bool:
    if _fs_exists is not None:
        return _fs_exists(path)
    return _original_exists(path)

os.path.exists = _vfs_exists
`

        if (inputFunc) {
            pythonSetup += `
async def _async_input(prompt: str = "") -> str:
    return await _input_fn(prompt)

builtins.input = _async_input
`
        }

        if (stdoutWrite) {
            pythonSetup += `
async def _async_print(*args, **kwargs):
    separator = kwargs.get('sep', ' ')
    end = kwargs.get('end', '\\n')
    output = separator.join(str(arg) for arg in args) + end
    await _print_fn(output)

builtins.print = _async_print
`
        }

        // Transform user code to use await with input() and print() calls
        let codeTransformed = code
        if (inputFunc) {
            codeTransformed = codeTransformed.replace(/\binput\s*\(([^\)]*)\)/g, (match, p1) => {
                return `(await input(${p1}))`
            })
        }
        if (stdoutWrite) {
            codeTransformed = codeTransformed.replace(/\bprint\s*\(([^\)]*)\)/g, (match, p1) => {
                return `(await print(${p1}))`
            })
        }

        const codeIndented = codeTransformed
            .split("\n")
            .map(line => "    " + line)
            .join("\n")

        // Build final code
        let fullCode
        if (inputFunc || stdoutWrite) {
            fullCode = `${pythonSetup}

async def __user_code():
${codeIndented}

await __user_code()
`
        } else {
            fullCode = `${pythonSetup}

${codeIndented}
`
        }

        console.log("[runPythonAsync] Executing Python code")
        await py.runPythonAsync(fullCode)
        console.log("[runPythonAsync] Execution completed")

        return outputBuffer || ""
    } catch (e) {
        console.error("[runPythonAsync] Error:", e.message, e)
        const error = `Python Error: ${e.message}\n`
        if (stdoutWrite) stdoutWrite(error)
        return (outputBuffer || "") + error
    }
}
