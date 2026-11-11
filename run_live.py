#!/usr/bin/env python3
"""Run each live prompt through client.py with Akshay's fallback order.
On 429/503 (or any HTTP error) move to the next model. Saves the raw
response and the model that actually ran, per case."""
import json, subprocess, sys
from pathlib import Path

CLIENT = ["python3", str(Path.home() / "workspace/custom-connectors/custom.gemini/bin/client.py")]
MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemma-4-31b-it"]
D = Path(__file__).parent / "live-prompts"
cases = json.loads((D / "cases.json").read_text())
only = [int(a) for a in sys.argv[1:]] or [c["n"] for c in cases]

for c in cases:
    n = c["n"]
    if n not in only:
        continue
    tried = []
    for model in MODELS:
        p = subprocess.run(CLIENT + ["generate", "--model", model, "--file", str(D / f"case{n}.txt")],
                           capture_output=True, text=True, timeout=300)
        if p.returncode == 0:
            (D / f"case{n}.response.json").write_text(p.stdout)
            (D / f"case{n}.model.txt").write_text(model)
            print(f"case {n}: OK on {model}" + (f" (after {tried})" if tried else ""))
            break
        tried.append(f"{model} -> {(p.stderr or p.stdout).strip()[:120]}")
    else:
        (D / f"case{n}.model.txt").write_text("ALL FAILED")
        print(f"case {n}: ALL MODELS FAILED: {tried}")
