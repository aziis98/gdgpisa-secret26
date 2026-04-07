import argparse
import json
import math
import os
import random
import sys
import time

# Ensure prerequisites exist
if not os.path.exists("vocab.json") or not os.path.exists("model_weights.json"):
    raise FileNotFoundError("Run train.py first to generate vocab.json and model_weights.json")

# Load tokenizer configuration
with open("vocab.json", "r") as f:
    uchars = json.load(f)

BOS = len(uchars)
vocab_size = len(uchars) + 1

# Deserialization of model weights
with open("model_weights.json", "r") as f:
    raw_state_dict_full = json.load(f)

# Extract architecture config if available
if "_config" in raw_state_dict_full:
    config = raw_state_dict_full["_config"]
    n_layer = config["n_layer"]
    n_embd = config["n_embd"]
    context_size = config["context_size"]
    n_head = config["n_head"]
    # Remove config from weights for processing
    raw_state_dict = {k: v for k, v in raw_state_dict_full.items() if k != "_config"}
else:
    # Fallback for old format
    n_layer = 1
    n_embd = 16
    context_size = 32
    n_head = 4
    raw_state_dict = raw_state_dict_full


# Forward-only scalar object
class Value:
    __slots__ = ("data",)

    def __init__(self, data):
        self.data = data

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return Value(self.data + other.data)

    def __sub__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return Value(self.data - other.data)

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return Value(self.data * other.data)

    def __truediv__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return Value(self.data / other.data)

    def __pow__(self, other):
        return Value(self.data**other)

    def exp(self):
        return Value(math.exp(self.data))

    def relu(self):
        return Value(max(0, self.data))


state_dict = {k: [[Value(val) for val in row] for row in mat] for k, mat in raw_state_dict.items()}

head_dim = n_embd // n_head


# Model definitions
def linear(x, w):
    return [sum((wi * xi for wi, xi in zip(wo, x)), Value(0)) for wo in w]


def softmax(logits):
    max_val = max(val.data for val in logits)
    exps = [(val - max_val).exp() for val in logits]
    total = sum(exps, Value(0))
    return [e / total for e in exps]


def rmsnorm(x):
    ms = sum((xi * xi for xi in x), Value(0)) / len(x)
    scale = (ms + 1e-5) ** -0.5
    return [xi * scale for xi in x]


def gpt(token_id, pos_id, keys, values):
    tok_emb = state_dict["wte"][token_id]
    pos_emb = state_dict["wpe"][pos_id]
    x = [t + p for t, p in zip(tok_emb, pos_emb)]
    x = rmsnorm(x)

    for li in range(n_layer):
        # Multi-head Attention
        x_residual = x
        x = rmsnorm(x)
        q = linear(x, state_dict[f"layer{li}.attn_wq"])
        k = linear(x, state_dict[f"layer{li}.attn_wk"])
        v = linear(x, state_dict[f"layer{li}.attn_wv"])
        keys[li].append(k)
        values[li].append(v)
        x_attn = []
        for h in range(n_head):
            hs = h * head_dim
            q_h = q[hs : hs + head_dim]
            k_h = [ki[hs : hs + head_dim] for ki in keys[li]]
            v_h = [vi[hs : hs + head_dim] for vi in values[li]]
            attn_logits = [
                sum((q_h[j] * k_h[t][j] for j in range(head_dim)), Value(0)) / head_dim**0.5
                for t in range(len(k_h))
            ]
            attn_weights = softmax(attn_logits)
            head_out = [
                sum((attn_weights[t] * v_h[t][j] for t in range(len(v_h))), Value(0)) for j in range(head_dim)
            ]
            x_attn.extend(head_out)
        x = linear(x_attn, state_dict[f"layer{li}.attn_wo"])
        x = [a + b for a, b in zip(x, x_residual)]

        # MLP
        x_residual = x
        x = rmsnorm(x)
        x = linear(x, state_dict[f"layer{li}.mlp_fc1"])
        x = [xi.relu() for xi in x]
        x = linear(x, state_dict[f"layer{li}.mlp_fc2"])
        x = [a + b for a, b in zip(x, x_residual)]

    logits = linear(x, state_dict["lm_head"])
    return logits


def generate(initial_tokens):
    """Generate text starting from initial tokens.

    Yields characters one at a time as they are generated.

    Args:
        initial_tokens: List of token IDs to start from
    """
    keys, values = [[] for _ in range(n_layer)], [[] for _ in range(n_layer)]

    # If no initial tokens, start from BOS
    if not initial_tokens:
        initial_tokens = [BOS]

    # Process all initial tokens to build up keys/values
    pos_id = 0
    for token in initial_tokens:
        logits = gpt(token, pos_id, keys, values)
        pos_id += 1

    # Now generate new tokens
    token_id = initial_tokens[-1]

    for _ in range(context_size - pos_id):
        logits = gpt(token_id, pos_id, keys, values)
        probs = softmax([Value(logit.data / temperature) for logit in logits])
        token_id = random.choices(range(vocab_size), weights=[p.data for p in probs])[0]

        if token_id == BOS:
            break

        char = uchars[token_id]
        yield char
        pos_id += 1


# Inference
# Parse arguments
parser = argparse.ArgumentParser(description="Text completion model")
parser.add_argument(
    "--sample", type=int, metavar="COUNT", help="Generate COUNT random samples instead of REPL"
)
parser.add_argument("-p", "--prefix", type=str, default="", help="Prefix to use when generating samples")
parser.add_argument(
    "-t", "--temperature", type=float, default=0.5, help="Temperature for sampling (default: 0.5)"
)
args = parser.parse_args()

temperature = args.temperature

if args.sample:
    # Sample mode: generate random samples
    print(f"--- Generating {args.sample} samples ---")

    # Tokenize prefix if provided
    initial_tokens = [BOS]
    prefix_text = ""
    if args.prefix:
        invalid_chars = [ch for ch in args.prefix if ch not in uchars]
        if invalid_chars:
            m = f"Error: Invalid character(s) in prefix: {', '.join(set(invalid_chars))}"
            print(m)
            sys.exit(1)
        initial_tokens = [BOS] + [uchars.index(ch) for ch in args.prefix]
        prefix_text = args.prefix

    for sample_idx in range(args.sample):
        result = prefix_text + "".join(generate(initial_tokens))
        print(f"sample {sample_idx + 1:2d}: {result}")
else:
    # REPL mode: interactive text completion
    print("--- GDGPisa DevFest 2026 Text Completion ---")
    print("Type a sentence to complete, or 'quit' to exit\n")

    while True:
        user_input = input("> ").strip()
        if user_input.lower() == "quit":
            break
        if not user_input:
            continue

        # Tokenize user input
        invalid_chars = [ch for ch in user_input if ch not in uchars]
        if invalid_chars:
            m = f"Error: Invalid character(s) not in vocabulary: {', '.join(set(invalid_chars))}\n"
            print(m)
            continue

        tokens = [BOS] + [uchars.index(ch) for ch in user_input]
        print("= ", end="", flush=True)
        for char in generate(tokens[1:]):
            print(char, end="", flush=True)
            time.sleep(0.05)
        print("\n")
