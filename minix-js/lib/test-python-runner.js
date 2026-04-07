#!/usr/bin/env node
/**
 * Test suite for python-runner.js
 *
 * Tests the Python runner library in a Node.js environment
 */

import { loadPyodide } from "pyodide"
import { runPythonAsync } from "./python-runner.js"

// Mock terminal for testing
class MockTerminal {
    constructor() {
        this.output = ""
        this._handler = null
    }

    write(text) {
        this.output += text
    }

    clear() {
        this.output = ""
    }

    onData(handler) {
        this._handler = handler
        return { dispose: () => {} }
    }

    simulateInput(data) {
        if (this._handler) {
            this._handler(data)
        }
    }

    getOutput() {
        return this.output
    }

    reset() {
        this.output = ""
    }
}

// Mock VFS for testing
class MockVFS {
    constructor() {
        this.files = {
            "/home/user/test-data.json": '[" ", "-", ".", "/", "0", "2"]',
            "/home/user/config.json": '{"setting1": true, "setting2": 42}',
        }
    }

    read(path) {
        return this.files[path] || null
    }

    write(path, content) {
        this.files[path] = content
    }

    addFile(path, content) {
        this.files[path] = content
    }
}

// Test runner
async function runTests() {
    console.log("🧪 Python Runner Test Suite\n")

    // Initialize Pyodide once for all tests
    console.log("Initializing Pyodide...")
    const py = await loadPyodide()
    console.log("✓ Pyodide initialized\n")

    let passed = 0
    let failed = 0

    // Test 1: Basic Python execution
    try {
        console.log("Test 1: Basic Python execution")
        const term = new MockTerminal()

        const output = await runPythonAsync('print("Hello, World!")', { py, term })

        if (output.includes("Hello, World!")) {
            console.log("  ✅ PASSED\n")
            passed++
        } else {
            console.log(`  ❌ FAILED: Expected output to contain "Hello, World!", got: ${output}\n`)
            failed++
        }
    } catch (e) {
        console.log(`  ❌ FAILED: ${e.message}\n`)
        failed++
    }

    // Test 2: Multiple print statements
    try {
        console.log("Test 2: Multiple print statements")
        const term = new MockTerminal()

        const output = await runPythonAsync(
            `
print("Line 1")
print("Line 2")
print("Line 3")
`,
            { py, term },
        )

        if (output.includes("Line 1") && output.includes("Line 2") && output.includes("Line 3")) {
            console.log("  ✅ PASSED\n")
            passed++
        } else {
            console.log(`  ❌ FAILED: Expected all lines in output, got: ${output}\n`)
            failed++
        }
    } catch (e) {
        console.log(`  ❌ FAILED: ${e.message}\n`)
        failed++
    }

    // Test 3: Python variables and operations
    try {
        console.log("Test 3: Python variables and operations")
        const term = new MockTerminal()

        const output = await runPythonAsync(
            `
x = 10
y = 20
result = x + y
print(f"Result: {result}")
`,
            { py, term },
        )

        if (output.includes("Result: 30")) {
            console.log("  ✅ PASSED\n")
            passed++
        } else {
            console.log(`  ❌ FAILED: Expected "Result: 30", got: ${output}\n`)
            failed++
        }
    } catch (e) {
        console.log(`  ❌ FAILED: ${e.message}\n`)
        failed++
    }

    // Test 4: VFS file reading
    try {
        console.log("Test 4: VFS file reading")
        const term = new MockTerminal()
        const vfs = new MockVFS()

        const output = await runPythonAsync(
            `
import json

# Read VFS file
with open("/home/user/test-data.json") as f:
    data = json.load(f)
    print(f"Loaded {len(data)} items")
`,
            { py, term, vfs },
        )

        if (output.includes("Loaded 6 items")) {
            console.log("  ✅ PASSED\n")
            passed++
        } else {
            console.log(`  ❌ FAILED: Expected to load 6 items, got: ${output}\n`)
            failed++
        }
    } catch (e) {
        console.log(`  ❌ FAILED: ${e.message}\n`)
        failed++
    }

    // Test 5: Error handling
    try {
        console.log("Test 5: Python error handling")
        const term = new MockTerminal()

        const output = await runPythonAsync(
            `
try:
    x = 1 / 0
except ZeroDivisionError as e:
    print(f"Caught error: {e}")
`,
            { py, term },
        )

        if (output.includes("Caught error")) {
            console.log("  ✅ PASSED\n")
            passed++
        } else {
            console.log(`  ❌ FAILED: Expected error handling to work, got: ${output}\n`)
            failed++
        }
    } catch (e) {
        console.log(`  ❌ FAILED: ${e.message}\n`)
        failed++
    }

    // Test 6: Module imports
    try {
        console.log("Test 6: Standard library imports")
        const term = new MockTerminal()

        const output = await runPythonAsync(
            `
import math
import json
import sys

result = math.sqrt(16)
print(f"sqrt(16) = {result}")
print(f"Python version: {sys.version_info.major}.{sys.version_info.minor}")
`,
            { py, term },
        )

        if (output.includes("sqrt(16) = 4.0") && output.includes("Python version:")) {
            console.log("  ✅ PASSED\n")
            passed++
        } else {
            console.log(`  ❌ FAILED: Expected imports to work, got: ${output}\n`)
            failed++
        }
    } catch (e) {
        console.log(`  ❌ FAILED: ${e.message}\n`)
        failed++
    }

    // Test 7: Input with stdin (non-interactive)
    try {
        console.log("Test 7: Input with stdin")

        const output = await runPythonAsync(
            `
name1 = input("Enter first name: ")
name2 = input("Enter second name: ")
print(f"Names: {name1}, {name2}")
`,
            { py, stdin: "Alice\nBob" },
        )

        if (output.includes("Names: Alice, Bob")) {
            console.log("  ✅ PASSED\n")
            passed++
        } else {
            console.log(`  ❌ FAILED: Expected input to be processed, got: ${output}\n`)
            failed++
        }
    } catch (e) {
        console.log(`  ❌ FAILED: ${e.message}\n`)
        failed++
    }

    // Summary
    console.log("\n" + "=".repeat(50))
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`)
    console.log("=".repeat(50))

    if (failed === 0) {
        console.log("\n✅ All tests passed!")
        process.exit(0)
    } else {
        console.log(`\n❌ ${failed} test(s) failed`)
        process.exit(1)
    }
}

// Run tests
runTests().catch(e => {
    console.error("❌ Fatal error:", e)
    process.exit(1)
})
