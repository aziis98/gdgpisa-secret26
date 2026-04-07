# Python Runner Library

A standalone, Pyodide-agnostic library for running Python code in virtualized environments with support for:

- ✅ Interactive stdin/stdout/stderr
- ✅ Virtual filesystem with IDBFS persistence
- ✅ Cross-platform (browser + Node.js)
- ✅ File operations (read/write/persist)
- ✅ Error handling and output capture
- ✅ ES6 modules (import/export)

## Module Support

This library uses ES6 modules. The project's `package.json` contains `"type": "module"` to enable native ES module support in Node.js.

## Files

### `python-runner.js`

The main library providing two exported functions:

```javascript
import { runPython, initPyodide } from "./python-runner.js"
```

#### `initPyodide(options)`

Initialize a Pyodide instance (browser only).

```javascript
const py = await initPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
    scriptSrc: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js",
})
```

#### `runPython(py, code, context)`

Run Python code in a virtualized environment.

**Parameters:**

- `py` (Pyodide instance) - Pyodide runtime (required)
- `code` (string) - Python code to execute (required)
- `context` (object) - Execution context (optional)
    - `fs` - Virtual filesystem with `resolve(path)` method
    - `term` - Terminal with `write(text)` method
    - `stdin` - Custom stdin handler function
    - `pauseShell` - Function to pause shell input
    - `restoreShell` - Function to restore shell input

**Returns:** Promise<string> - Output buffer

### `test-python-runner.js`

Comprehensive test suite for the library in Node.js.

```bash
# With "type": "module" in package.json (recommended)
node lib/test-python-runner.js
```

1. Basic Python execution
2. Multiple print statements
3. Variables and operations
4. JSON file reading from VFS
5. Error handling
6. Standard library imports
7. Output capture without terminal

## Usage Example (Browser)

```javascript
// In your browser environment with type="module"
import { runPython, initPyodide } from "./lib/python-runner.js"

// Initialize Pyodide
const py = await initPyodide()

// Set up a fictional terminal
const term = {
    write: text => console.log(text),
    onData: handler => ({ dispose: () => {} }),
}

// Run Python code
const output = await runPython(
    py,
    `
import json
print(f"Python version: {__import__('sys').version_info.major}")
`,
    { term },
)

console.log("Final output:", output)
```

## Usage Example (Node.js with mock VFS)

```javascript
import { runPython, initPyodide } from "./lib/python-runner.js"

const py = await initPyodide()

// Mock filesystem
const fs = {
    resolve: path => {
        if (path === "/home/user/data.json") {
            return {
                type: "file",
                content: '{"name": "test"}',
            }
        }
        return null
    },
}

const output = await runPython(
    py,
    `
import json
with open('/home/user/data.json') as f:
    data = json.load(f)
    print(f"Name: {data['name']}")
`,
    { fs },
)
```

## Integration with minix.js

The library is integrated into `index.html` as the `/bin/python` command:

```bash
$ python hello.py
$ python -c "print('Hello')"
$ python infer.py --sample 5
```

Python code can access:

- Shell VFS files at `/home/user/`
- IDBFS-backed persistence
- Interactive input/output
- Standard library

## Architecture

```
┌─────────────────────────────────┐
│   Shell (minix.js)              │
│  - Virtual filesystem           │
│  - Command execution            │
│  - Terminal I/O                 │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  python-runner.js               │
│  - Pyodide instance (generic)   │
│  - File operations              │
│  - I/O multiplexing             │
│  - Error handling               │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   Pyodide + Python WASM         │
│  - Code execution               │
│  - Standard library             │
│  - IDBFS mount                  │
└─────────────────────────────────┘
```

## Notes

- The library is **Pyodide-instance independent** - any Pyodide instance can be passed
- Stdin handler is optional; if not provided and a terminal exists, it uses interactive mode
- IDBFS persistence is automatic when `fs` context is provided
- Works in both browser and Node.js environments
- Error handling preserves output buffer for partial results
