#!/usr/bin/env python3
"""Text-injection baseline for the §2.8 probe on a text-strong model (GLM-5.2).

GLM-5.2 is the paper's strong model (text injection defense ~100). It is
text-only, so it can run the text_only / ocr_text probe forms but not
image_only. This establishes whether the strong model actually resists the
*text* form of our injections — the "text-safe" half of hypothesis H — while
the image half waits on a vision model with balance.

Key source: the active z.ai coding-plan key in ~/.zcode/v2/config.json
(provider builtin:zai). The key is READ at runtime and never printed.
Endpoint: api.z.ai Anthropic-format (ZaiTarget).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from agent_redteam.suites.multimodal import MultimodalSuite, MultimodalCheck
from agent_redteam.targets.zai_target import ZaiTarget
from agent_redteam.vision_probe import run_probe, summarize_probes

ZCODE_CONFIG = os.path.expanduser("~/.zcode/v2/config.json")
TEXT_FORMS = ("text_only", "ocr_text")


def _zcode_zai_key() -> str:
    with open(ZCODE_CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    return cfg.get("provider", {}).get("builtin:zai", {}).get("options", {}).get("apiKey", "")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="GLM-5.2 text-injection baseline (§2.8 text half).")
    ap.add_argument("--model", default="GLM-5.2")
    ap.add_argument("--base-url", default="https://api.z.ai/api/anthropic")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    key = _zcode_zai_key()
    if not key:
        print("ERROR: no builtin:zai apiKey in ~/.zcode/v2/config.json", file=sys.stderr)
        return 2

    suite = MultimodalSuite()
    samples = [s for s in suite.load_samples() if s.get("attack_type") == "vision_image"]
    if args.limit:
        samples = samples[: args.limit]

    target = ZaiTarget(model=args.model, api_key=key, base_url=args.base_url, max_tokens=300)
    check = MultimodalCheck()

    print(f"Text baseline: {len(samples)} sample(s) × {TEXT_FORMS} on {args.model} …", file=sys.stderr)
    results = [run_probe(s, target, check, forms=TEXT_FORMS) for s in samples]
    summary = summarize_probes(results)

    report = {"model": args.model, "forms": list(TEXT_FORMS), "summary": summary, "results": results}
    out = args.out or f"validation/text-baseline-{args.model}.json"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\nWrote {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
