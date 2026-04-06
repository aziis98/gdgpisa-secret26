import argparse
import json
import os
import random
import sys

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import Adam

torch.manual_seed(42)
random.seed(42)
np.random.seed(42)

# Dataset generation
if not os.path.exists("input.txt"):
    import urllib.request

    names_url = "https://raw.githubusercontent.com/karpathy/makemore/988aa59/names.txt"
    urllib.request.urlretrieve(names_url, "input.txt")

docs = [line.strip() for line in open("input.txt") if line.strip()]
random.shuffle(docs)
print(f"num docs: {len(docs)}")
print(f"Training phrases: {docs}")

# Tokenizer setup
uchars = sorted(set("".join(docs)))
BOS = len(uchars)
vocab_size = len(uchars) + 1
print(f"vocab size: {vocab_size}")

# Export vocabulary for inference
with open("vocab.json", "w") as f:
    json.dump(uchars, f, indent=2)

# ---------------------------------------------------------
# ARCHITECTURE TWEAKS FOR MEMORIZATION & SMALL FILE SIZE
# ---------------------------------------------------------
n_layer = 4
n_embd = 4
context_size = 32
n_head = 2
head_dim = n_embd // n_head


class GPTModel(nn.Module):
    def __init__(self, vocab_size, n_embd, context_size, n_layer, n_head):
        super().__init__()
        self.n_layer = n_layer
        self.n_head = n_head
        self.head_dim = n_embd // n_head

        # Embeddings
        self.wte = nn.Embedding(vocab_size, n_embd)
        self.wpe = nn.Embedding(context_size, n_embd)

        # Transformer blocks
        self.layers = nn.ModuleList()
        for _ in range(n_layer):
            self.layers.append(
                nn.ModuleDict(
                    {
                        "attn_wq": nn.Linear(n_embd, n_embd, bias=False),
                        "attn_wk": nn.Linear(n_embd, n_embd, bias=False),
                        "attn_wv": nn.Linear(n_embd, n_embd, bias=False),
                        "attn_wo": nn.Linear(n_embd, n_embd, bias=False),
                        "mlp_fc1": nn.Linear(n_embd, 4 * n_embd, bias=False),
                        "mlp_fc2": nn.Linear(4 * n_embd, n_embd, bias=False),
                    }
                )
            )

        # Output layer
        self.lm_head = nn.Linear(n_embd, vocab_size, bias=False)

        # Initialize weights
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.normal_(module.weight, 0, 0.02)  # Standardized init
            elif isinstance(module, nn.Embedding):
                nn.init.normal_(module.weight, 0, 0.02)

    def forward(self, tokens, positions):
        batch_size, seq_len = tokens.shape

        # Embeddings
        tok_emb = self.wte(tokens)
        pos_emb = self.wpe(positions)
        x = tok_emb + pos_emb

        # Layer norm helper
        def rmsnorm(inp):
            ms = (inp**2).mean(-1, keepdim=True)
            scale = (ms + 1e-5) ** -0.5
            return inp * scale

        x = rmsnorm(x)

        # Transformer layers
        for layer_dict in self.layers:
            x_residual = x
            x = rmsnorm(x)

            # Multi-head attention
            q = layer_dict["attn_wq"](x)  # type: ignore
            k = layer_dict["attn_wk"](x)  # type: ignore
            v = layer_dict["attn_wv"](x)  # type: ignore

            # Reshape for multi-head attention
            q = q.view(batch_size, seq_len, self.n_head, self.head_dim).transpose(1, 2)
            k = k.view(batch_size, seq_len, self.n_head, self.head_dim).transpose(1, 2)
            v = v.view(batch_size, seq_len, self.n_head, self.head_dim).transpose(1, 2)

            # Attention scores
            scores = torch.matmul(q, k.transpose(-2, -1)) / (self.head_dim**0.5)

            # Causal mask
            mask = torch.triu(torch.ones(seq_len, seq_len, device=scores.device), diagonal=1).bool()
            scores = scores.masked_fill(mask.unsqueeze(0).unsqueeze(0), float("-inf"))

            # Softmax and apply to values
            attn_weights = F.softmax(scores, dim=-1)
            attn_output = torch.matmul(attn_weights, v)

            # Reshape back
            attn_output = attn_output.transpose(1, 2).contiguous()
            attn_output = attn_output.view(batch_size, seq_len, self.n_head * self.head_dim)

            # Output projection
            x = layer_dict["attn_wo"](attn_output)  # type: ignore
            x = x + x_residual

            # MLP
            x_residual = x
            x = rmsnorm(x)
            x = layer_dict["mlp_fc1"](x)  # type: ignore
            x = F.relu(x)
            x = layer_dict["mlp_fc2"](x)  # type: ignore
            x = x + x_residual

        # LM head
        logits = self.lm_head(x)
        return logits


# Create model
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = GPTModel(vocab_size, n_embd, context_size, n_layer, n_head).to(device)
print(f"Model on {device}")

# Count parameters
num_params = sum(p.numel() for p in model.parameters())
print(f"num params: {num_params}")

# Optimizer: Balanced learning rate for stable memorization
optimizer = Adam(model.parameters(), lr=0.01, betas=(0.85, 0.99), eps=1e-8)

# Parse CLI arguments
parser = argparse.ArgumentParser(description="Train GPT model")
parser.add_argument(
    "-n", "--num-steps", type=int, default=500, help="Number of training steps (default: 500)"
)
parser.add_argument(
    "-t", "--temperature", type=float, default=0.1, help="Temperature for generation (default: 0.1)"
)
args = parser.parse_args()


def generate_from_prompt(model, prompt, device, context_size, uchars, temperature=0.5):
    """Generate text starting from a prompt."""
    tokens = [BOS] + [uchars.index(ch) for ch in prompt]

    with torch.no_grad():
        while len(tokens) < context_size:
            # Pass the entire sequence generated so far for attention history
            tok = torch.tensor([tokens], dtype=torch.long, device=device)
            pos = torch.tensor([list(range(len(tokens)))], dtype=torch.long, device=device)

            logits = model(tok, pos)

            # Random sampling based on temperature-scaled probabilities
            probs = torch.softmax(logits[0, -1] / temperature, dim=0)
            next_token = int(torch.multinomial(probs, num_samples=1).item())

            if next_token == BOS:
                break

            tokens.append(next_token)

    return "".join(uchars[t] for t in tokens[1:])


def compute_generation_score(target, generated, prefix):
    """Compute a score for how well generated text matches the target phrase."""
    gen_clean = generated.strip()
    gen_remaining = gen_clean[len(prefix) :]
    phrase_remaining = target[len(prefix) :]

    correct_chars = 0
    for g_char, p_char in zip(gen_remaining, phrase_remaining):
        if g_char == p_char:
            correct_chars += 1
        else:
            break

    if not phrase_remaining:
        return 1.0 if gen_clean == target else 0.0
    return correct_chars / len(phrase_remaining)


def compute_generation_score_no_early_stopping(target, generated, prefix):
    """Compute score by counting all matching characters without early stopping."""
    gen_clean = generated.strip()
    gen_remaining = gen_clean[len(prefix) :]
    phrase_remaining = target[len(prefix) :]

    correct_chars = sum(1 for g_char, p_char in zip(gen_remaining, phrase_remaining) if g_char == p_char)

    if not phrase_remaining:
        return 1.0 if gen_clean == target else 0.0
    return correct_chars / len(phrase_remaining)


def validate_generation(model, device, context_size, uchars, training_phrases, temperature=0.5):
    """Check if model can generate all training phrases using first word as prompt."""
    results = {}
    model.eval()

    with torch.no_grad():
        for phrase in training_phrases:
            phrase_clean = phrase.strip()
            words = phrase_clean.split()
            first_word = words[0] if words else ""

            if not first_word:
                results[phrase] = {"generated": "", "prompt": "", "score": 0.0}
                continue

            # Generate from first word
            generated = generate_from_prompt(model, first_word, device, context_size, uchars, temperature)
            score = compute_generation_score_no_early_stopping(phrase_clean, generated, first_word)

            results[phrase] = {"generated": generated, "prompt": first_word, "score": score}

    model.train()
    avg_score = sum(r["score"] for r in results.values()) / len(results) if results else 0.0
    return avg_score, results


# Training loop
num_steps = args.num_steps
model.train()

last_output_height = 0

for step in range(num_steps):
    # Full-batch training: Use all docs at once to guarantee it doesn't unlearn
    batch_tokens_list = []

    for doc in docs:
        tokens = [BOS] + [uchars.index(ch) for ch in doc] + [BOS]
        n = min(context_size, len(tokens) - 1)
        batch_tokens_list.append((tokens[:n], tokens[1 : n + 1]))

    # Find max length in batch for padding
    max_n = max(len(t[0]) for t in batch_tokens_list)

    # Pad sequences and create tensors
    token_ids_list = []
    target_ids_list = []
    positions_list = []

    for tokens, targets in batch_tokens_list:
        pad_len = max_n - len(tokens)
        token_ids_list.append(tokens + [BOS] * pad_len)
        target_ids_list.append(targets + [-100] * pad_len)
        positions_list.append(list(range(len(tokens))) + [0] * pad_len)

    token_ids = torch.tensor(token_ids_list, dtype=torch.long, device=device)
    target_ids = torch.tensor(target_ids_list, dtype=torch.long, device=device)
    positions = torch.tensor(positions_list, dtype=torch.long, device=device)

    # Forward pass
    logits = model(token_ids, positions)

    # Loss - using ignore_index=-100 ensures we only train on the actual characters
    loss = F.cross_entropy(logits.view(-1, vocab_size), target_ids.view(-1), ignore_index=-100)

    # Backward pass
    optimizer.zero_grad()
    loss.backward()

    # Learning rate schedule
    lr_t = 0.01 * (1 - step / num_steps)
    for param_group in optimizer.param_groups:
        param_group["lr"] = lr_t

    optimizer.step()

    # print(f"step {step + 1:4d} / {num_steps:4d} | loss {loss.item():.4f}", end="\r")
    if (step + 1) % max(1, int(num_steps * 0.05)) == 0:
        # Validate generation
        avg_score, val_results = validate_generation(
            model, device, context_size, uchars, docs, args.temperature
        )

        status = "✓ PERFECT" if avg_score == 1.0 else f"Learning ({avg_score:.2%})"

        output_lines = [f"step {step + 1:4d} / {num_steps:4d} | loss {loss.item():.4f} | {status}"]
        for phrase, result in val_results.items():
            score_pct = f"{result['score']:.1%}"
            p = f"'{result['prompt']}'"
            output_lines.append(f"  [{score_pct:>6}] {p:>10} => '{result['generated'].strip()}'")

        sys.stdout.write("\033[?2026h")
        if last_output_height > 0:
            sys.stdout.write(f"\033[{last_output_height}A\033[0G\033[J")
        sys.stdout.write("\n".join(output_lines) + "\n")
        sys.stdout.write("\033[?2026l")
        sys.stdout.flush()
        last_output_height = len(output_lines)

        # Break early if perfect
        if avg_score == 1.0:
            print("\nPerfect memorization reached! Stopping early.")
            break

# Convert model to compatible format
print("\nExporting model weights...")


def convert_model_to_dict(model):
    state = {}

    # Helper to round weights to 5 decimals to drastically reduce JSON string size!
    def to_list_rounded(tensor):
        return np.round(tensor.data.cpu().numpy(), 5).tolist()

    state["wte"] = to_list_rounded(model.wte.weight)
    state["wpe"] = to_list_rounded(model.wpe.weight)
    state["lm_head"] = to_list_rounded(model.lm_head.weight)

    for i, layer_dict in enumerate(model.layers):
        for key in layer_dict.keys():
            state[f"layer{i}.{key}"] = to_list_rounded(layer_dict[key].weight)

    return state


serializable_state = convert_model_to_dict(model)

# Add architecture parameters for inference compatibility
serialized_with_config = {
    "_config": {
        "n_layer": n_layer,
        "n_embd": n_embd,
        "context_size": context_size,
        "n_head": n_head,
    },
    **serializable_state,
}

with open("model_weights.json", "w") as f:
    json.dump(serialized_with_config, f, indent=2)  # Removed indent=2 to save space

print(f"Training complete. Output size: {os.path.getsize('model_weights.json') / 1024:.2f} KB")
