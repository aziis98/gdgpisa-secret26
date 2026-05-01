# Minix JS (Prototype)

This is where I built the very first version of the Minix JS environment. It was my foundational prototype for the virtual filesystem (VFS), terminal emulation, and asynchronous Python integration that eventually made it into the final **secret26** CTF dashboard.

## Project Context

The final platform is actually a mashup of several independent experiments I did. This folder is where I figured out the core mechanics that make the terminal feel real:

- **The "Metacircular" Shell**: I wanted a terminal that could run "binaries" just by calling JavaScript functions. This was my first proof-of-concept for that modular command system.
- **Solving the Stdin Problem**: This was definitely the trickiest part. Pyodide (the Python engine) is synchronous, but the browser's terminal is asynchronous. To stop the browser from freezing every time Python waits for you to type something, I had to "patch" the code on the fly so it could wait for input without locking up the UI.
- **Building a Virtual Filesystem (VFS)**: Since I didn't want to use a server, I needed a way to pretend there was a hard drive. I tested using nested JavaScript objects to represent folders and files that could be saved and loaded instantly.

## Technical Legacy

I derived many of the core modules in the current CTF (`src/minix/*.js`) from the experimental code I wrote here in the `lib/` and `index.html` files.

Even though this code is "old" now, I'm keeping it here as a reference for how the whole system's architecture evolved. 

> [!IMPORTANT]
> This is a **research prototype**. The active, production-ready implementation of the Minix environment I used in the CTF is located in the root `/src/minix/` directory.

---

*Initial release of Minix JS for GDGPisa.*
