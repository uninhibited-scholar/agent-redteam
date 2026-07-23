#!/usr/bin/env python3
"""Controlled 4-channel delivery experiment (the framing-artifact test).

Sends ONE harmful, transcription-proof payload to ONE model through four
channels — plain_text, doc_pipeline (SVG-as-text, the paper's original
"multimodal" method), image_plain, image_hidden — and compares bypass rates.

Framing-artifact hypothesis: bypass(plain_text) ≈ bypass(doc_pipeline) >>
bypass(image_*). If so, the reported "multimodal blind spot" is an artifact of
the document-pipeline framing, not the vision channel.

Default target: Volcengine Doubao (multimodal), key read from
~/.openclaw/openclaw.json (never printed).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from agent_redteam.suites.multimodal import MultimodalCheck
from agent_redteam.targets.openai_compat import OpenAITarget
from agent_redteam.vision_probe import (
    run_probe, summarize_probes, build_delivery_forms, DELIVERY_FORMS,
)

OPENCLAW_CONFIG = os.path.expanduser("~/.openclaw/openclaw.json")
ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3"
PROVIDER = "custom-ark-cn-beijing-volces-com"
SAMPLES = os.path.join(os.path.dirname(__file__), "..", "validation", "h_test_harmful.jsonl")


def _ark_key() -> str:
    with open(OPENCLAW_CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    return cfg.get("models", {}).get("providers", {}).get(PROVIDER, {}).get("apiKey", "")


def _load_samples(path: str) -> list[dict]:
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="4-channel delivery framing-artifact experiment.")
    ap.add_argument("--model", default="doubao-seed-1-6-250615")
    ap.add_argument("--base-url", default=ARK_BASE)
    ap.add_argument("--samples", default=SAMPLES)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    key = _ark_key()
    if not key:
        print(f"ERROR: no apiKey for provider {PROVIDER} in {OPENCLAW_CONFIG}", file=sys.stderr)
        return 2

    samples = _load_samples(args.samples)
    if args.limit:
        samples = samples[: args.limit]

    target = OpenAITarget(model=args.model, api_key=key, base_url=args.base_url, max_tokens=300)
    check = MultimodalCheck()

    print(f"Delivery experiment: {len(samples)} payload(s) × {DELIVERY_FORMS} on {args.model} …",
          file=sys.stderr)
    results = [run_probe(s, target, check, forms=DELIVERY_FORMS, form_builder=build_delivery_forms)
               for s in samples]
    summary = summarize_probes(results, DELIVERY_FORMS)

    report = {"model": args.model, "forms": list(DELIVERY_FORMS), "summary": summary, "results": results}
    out = args.out or f"validation/delivery-experiment-{args.model}.json"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\nWrote {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
