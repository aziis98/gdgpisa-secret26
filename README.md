# secret26 - GDGPisa Secret DevFest 2026 CTF

Welcome to the **secret26** repository. This project was made for the [GDGPisa 2026 DevFest](https://devfest.gdgpisa.it/) event and deployed at [https://secret26.gdgpisa.it/](https://secret26.gdgpisa.it/). The event is now over so I polished the project a bit and made it open source.

The project simulates an isolated terminal environment ("Minix JS") for a localized recovery mission of the **classified DevBot secret code**.

## Features

- **Minix JS Metacircular Shell**: A custom, modular shell environment built on top of [xterm.js](https://xtermjs.org/).

- **Virtual Filesystem (VFS)**: A robust, in-memory filesystem with (inspired by) Unix-like behavior.
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

The tech stack is pretty simple: it's all vanilla HTML, CSS, and JS powered by [Vite](https://vitejs.dev/). The terminal itself is built on [xterm.js](https://xtermjs.org/), and all the Python code is run in the browser via [Pyodide](https://pyodide.org/). This setup allows the [microGPT](https://karpathy.github.io/2026/02/12/microgpt/) model to run inference locally.

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
    # or
    bun dev
    ```

3.  **Open the dashboard**:
    Navigate to `http://localhost:3000` in your browser.

## The Challenge

The **DevBot** training codebase and primary dataset have been compromised. Your objective is to use the provided terminal to:

1.  Explore the localized file system.

2.  Execute recovery scripts (like `infer.py`).

3.  Recover the **classified secret string** from the isolated core.

Good luck, operative.

## Technical Notes

I spent a lot of time figuring out how to make this terminal feel like a real system. I really like metacircular environments, so the "metacircular" shell was my first experiment in running JS functions as binaries, which laid the groundwork for the whole command system.

The hardest part was handling the stdin for the "readline" behavior. Since Pyodide is synchronous and the browser is async, I resorted to monkey-patching the code on the fly to make it wait for user input without completely locking up the UI. I'm not proud of it, but it works xD.

I also built a virtual filesystem using nested JS objects so I could simulate a real (mutable) directory structure that saves and loads instantly without needing a server.

---

_Created by @aziis98 for GDGPisa._
