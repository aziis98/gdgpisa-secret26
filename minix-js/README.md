# Minix JS (Prototype)

This directory contains the original, first implementation of the Minix JS environment. It served as the foundational prototype for the virtual filesystem (VFS), terminal emulation, and asynchronous Python integration now used in the **secret26** CTF dashboard.

## Project Context

The final **secret26** platform is a collage of various independent projects and prototypes. This repository represents the initial research into:
- **Metacircular Shell Mechanics**: Developing a JavaScript-based shell that can execute binary-like functions.
- **Asynchronous Stdin Patching**: Engineering the bridge between Pyodide's synchronous Python environment and the browser's asynchronous terminal input.
- **Map-based VFS**: Testing the recursive serialization and deserialization of a virtual directory structure.

## Technical Legacy

Many of the core modules in the current CTF (`src/minix/*.js`) were derived from the experimental code found here in the `lib/` and `index.html` files of this prototype. 

While this version is now considered a legacy implementation, it remains here as a reference for the evolutionary history of the system's architecture.

---

*Initial release of Minix JS for GDGPisa.*
