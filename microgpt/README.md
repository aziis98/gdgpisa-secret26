# MicroGPT Implementation for DevBot

This directory contains a minimalist, zero-dependency GPT implementation used for the DevBot localized recovery mission. The core logic is based on Andrej Karpathy's [microGPT](https://karpathy.ai/microgpt.html), which has been further optimized and refactored for this CTF.

## Refinement and Optimization

The original `microGPT` architecture has been adapted through several key modifications:
- **Component Split**: The system has been decoupled into dedicated scripts for training and inference.
- **Pure-Python Autograd**: The `train.py` script implements a GPT architecture from scratch using a custom autograd engine (based on Andrej Karpathy's `micrograd`).
- **Torch-Optimized Training**: The `train_fast.py` script leverages **PyTorch** for high-performance model optimization, ensuring rapid convergence.
- **Standalone Inference**: The `infer.py` module is designed to run independently of the training framework, making it suitable for deployment in the Pyodide environment within the CTF dashboard.

## Core Components and CLI Options

### `train.py`
A pure-Python implementation of the GPT architecture using a custom autograd engine.
- **Options**: None. Parameters are hardcoded for pedagogical clarity and stability.

### `train_fast.py`
A high-speed training script optimized with PyTorch.
- `-n`, `--num-steps` (int): Number of training steps (default: 500).
- `-t`, `--temperature` (float): Temperature used during validation generation (default: 0.1).

### `infer.py`
The production inference script used by the DevBot dashboard.
- `-p`, `--prefix` (string): Initial text to seed the generation (default: "").
- `-t`, `--temperature` (float): Sampling temperature; higher values increase randomness (default: 0.5).
- `--sample` (int): If provided, generates the specified number of random samples and exits.
- **Default Mode**: If run without `--sample`, it enters an interactive REPL mode for real-time text completion.

## Checkpoint Data
- **`model_weights.json`**: The serialized system memory state containing architecture configuration and layer weights.
- **`vocab.json`**: The character-level vocabulary mapping used for encoding and decoding.

---

*Part of the GDGPisa Secret DevFest 2026 CTF.*
