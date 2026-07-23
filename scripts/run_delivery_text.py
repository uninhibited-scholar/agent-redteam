#!/usr/bin/env python3
"""Text-channel slice of the delivery experiment for a text-only model.

Runs plain_text vs doc_pipeline (the paper's SVG-as-text "multimodal" method) on
a text-only model — GLM-5.2 by default, the paper's original strong model, via
the flat z.ai coding subscription in ~/.zcode/v2 (NOT metered, key never
printed). This dissects whether the doc_pipeline framing inflates the bypass
rate on the model the paper actually used.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from agent_redteam.suites.multimodal import MultimodalCheck
from agent_redteam.targets.zai_target import ZaiTarget
from agent_redteam.vision_probe import run_probe, summarize_probes, build_delivery_forms

ZCODE_CONFIG = os.path.expanduser("~/.zcode/v2/config.json")
TEXT_DELIVERY = ("plain_text", "doc_pipeline")
SAMPLES = os.path.join(os.path.dirname(__file__), "..", "validation", "h_test_harmful.jsonl")


def _zcode_zai_key() -> str:
    with open(ZCODE_CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    return cfg.get("provider", {}).get("builtin:zai", {}).get("options", {}).get("apiKey", "")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="plain_text vs doc_pipeline on a text-only model.")
    ap.add_argument("--model", default="GLM-5.2")
    ap.add_argument("--base-url", default="https://api.z.ai/api/anthropic")
    ap.add_argument("--samples", default=SAMPLES)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    key = _zcode_zai_key()
    if not key:
        print("ERROR: no builtin:zai apiKey in ~/.zcode/v2/config.json", file=sys.stderr)
        return 2

    samples = [json.loads(l) for l in open(args.samples, encoding="utf-8") if l.strip()]
    if args.limit:
        samples = samples[: args.limit]

    target = ZaiTarget(model=args.model, api_key=key, base_url=args.base_url, max_tokens=300)
    check = MultimodalCheck()

    print(f"Text delivery: {len(samples)} payload(s) × {TEXT_DELIVERY} on {args.model} …", file=sys.stderr)
    results = [run_probe(s, target, check, forms=TEXT_DELIVERY, form_builder=build_delivery_forms)
               for s in samples]
    summary = summarize_probes(results, TEXT_DELIVERY)

    report = {"model": args.model, "forms": list(TEXT_DELIVERY), "summary": summary, "results": results}
    out = args.out or f"validation/delivery-text-{args.model}.json"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\nWrote {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
