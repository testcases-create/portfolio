"""Precomputes attention for the "Watch attention" demo from a small open model.

Writes public/lab/attention.json in the format src/lab/watch-attention/logic.ts
reads: for each sentence, every layer and head, and every query token, the
attention over that token and the tokens before it, one byte per weight
(round(weight * 255)), base64-encoded.

    python -m venv .venv && . .venv/bin/activate
    pip install torch transformers
    python scripts/precompute-attention.py            # distilgpt2, about 350 MB download
    python scripts/precompute-attention.py --model gpt2

The sentences come from scripts/attention-sentences.ts, so the sample data and
the real data always cover the same sentences.
"""

import argparse
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sentences() -> list[str]:
    source = (ROOT / "scripts" / "attention-sentences.ts").read_text(encoding="utf8")
    return re.findall(r"^\s*'((?:[^'\\]|\\.)*)',?\s*$", source, flags=re.M)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default="distilgpt2", help="a causal language model on the Hugging Face hub")
    parser.add_argument("--out", default=str(ROOT / "public" / "lab" / "attention.json"))
    args = parser.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model, attn_implementation="eager")
    model.eval()
    layers = model.config.n_layer
    heads = model.config.n_head

    out = {"model": args.model, "source": "model", "layers": layers, "heads": heads, "sentences": []}
    for text in sentences():
        ids = tokenizer(text, return_tensors="pt")
        with torch.no_grad():
            result = model(**ids, output_attentions=True)
        # GPT-2's tokeniser marks a leading space with "Ġ"; decode each id to get readable text.
        tokens = [tokenizer.decode([i]) for i in ids["input_ids"][0].tolist()]
        count = len(tokens)
        data = bytearray()
        for layer in result.attentions:  # each: (batch, heads, query, key)
            for head in range(heads):
                weights = layer[0, head]
                for query in range(count):
                    row = weights[query, : query + 1].tolist()
                    data.extend(max(0, min(255, round(w * 255))) for w in row)
        expected = layers * heads * count * (count + 1) // 2
        assert len(data) == expected, f"{text!r}: {len(data)} bytes, expected {expected}"
        out["sentences"].append(
            {"text": text, "tokens": tokens, "attention": base64.b64encode(bytes(data)).decode("ascii")}
        )
        print(f"{count:3d} tokens  {text}")

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(f"Wrote {args.out} ({Path(args.out).stat().st_size / 1000:.1f} KB) from {args.model}.")


if __name__ == "__main__":
    main()
