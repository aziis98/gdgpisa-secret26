# secret26 - GDGPisa Secret DevFest 2026 CTF

Welcome to the **secret26** repository. This project is a high-fidelity, neo-brutalist dashboard developed for the GDGPisa Secret DevFest 2026 CTF event. It simulates an isolated terminal environment ("Minix JS") for a localized recovery mission of the **classified DevBot secret code**.

## Features

- **Minix JS Metacircular Shell**: A custom, modular shell environment built on top of [xterm.js](https://xtermjs.org/).
- **Virtual Filesystem (VFS)**: A robust, in-memory filesystem with support for standard Unix utilities:
  - **File Operations**: `ls`, `cat`, `mkdir`, `rm`, `touch`, `cp`, `mv`.
  - **Text Processing**: `grep`, `find`, `head`, `tail`.
  - **System Info**: `pwd`, `whoami`, `date`, `uname`, `man`.
  - **Utilities**: `echo`, `clear`, `help`, `sl`.
  - **Interactive Tools**: `edit` (built-in modal text editor).
- **Python Integration**: Direct access to a complete **Python 3.11+** runtime via [Pyodide](https://pyodide.org/), including asynchronous I/O, VFS-aware file operations, and access to the standard library.
- **Persistence Layer**: Automated state saving to `localStorage`, ensuring user progress (files, command history, and environment) is preserved across sessions.
- **System Visualizations**: 
  - **Datamatrix RAM Snapshot**: Real-time visualization of the system's memory state (serialized VFS + Shell state) rendered as a pixelated data matrix.
  - **Live Stats Grid**: Tactical monitoring of VFS nodes, memory usage, current directory, and shell activity.
- **Neo-Brutalist Aesthetic**: A high-contrast, tactile UI designed for maximum impact and readability in a "hacker" context.

## Tech Stack

- **Core**: Vanilla HTML5, CSS3, and JavaScript (ES Modules).
- **Styling**: Native CSS Variables and `@layer` orchestration for a modular design system.
- **Terminal**: `xterm.js` for high-performance terminal rendering.
- **Python**: `Pyodide` for local, zero-server Python execution.
- **Build System**: [Vite](https://vitejs.dev/) for ultra-fast development and optimized production bundles.

## Getting Started

To run the dashboard locally:

1.  **Install dependencies**:
    ```bash
    npm install
    # or
    bun install
    ```

2.  **Start the development server**:
    ```bash
    npm run dev
    ```

3.  **Open the dashboard**:
    Navigate to `http://localhost:3000` in your browser.

## The Challenge

The **DevBot** training codebase and primary dataset have been compromised. Your objective is to use the provided terminal to:
1.  Explore the localized file system.
2.  Execute recovery scripts (like `infer.py`).
3.  Recover the **classified secret string** from the isolated core.

Good luck, operative.

---

*Created by @aziis98 for GDGPisa.*
