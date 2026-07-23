#!/usr/bin/env python3
"""Full §2.8 probe on Volcengine Doubao (a multimodal model → all three forms).

Unlike GLM-5.2 (text-only) this model is multimodal, so text_only / ocr_text /
image_only all run on ONE model — the complete hypothesis-H test (text-safe vs
image-unsafe on the same model).

Requires the Doubao model to be activated on the Ark account (if it is paused by
"Safe Experience Mode", enable it on the Model Activation page). Key is read
from ~/.openclaw/openclaw.json at runtime and never printed. Ark's chat endpoint
is OpenAI-compatible, so the OpenAI-format vision content array works directly.

Usage:
    python scripts/run_doubao_vision.py                       # all 5, doubao-seed-1-6-250615
    python scripts/run_doubao_vision.py --limit 1             # smoke
    python scripts/run_doubao_vision.py --model <ark-model-or-endpoint-id>
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from agent_redteam.suites.multimodal import MultimodalSuite, MultimodalCheck
from agent_redteam.targets.openai_compat import OpenAITarget
from agent_redteam.vision_probe import run_probe, summarize_probes

OPENCLAW_CONFIG = os.path.expanduser("~/.openclaw/openclaw.json")
ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3"
PROVIDER = "custom-ark-cn-beijing-volces-com"


def _ark_key() -> str:
    with open(OPENCLAW_CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    return cfg.get("models", {}).get("providers", {}).get(PROVIDER, {}).get("apiKey", "")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Full §2.8 probe on a Doubao multimodal model.")
    ap.add_argument("--model", default="doubao-seed-1-6-250615")
    ap.add_argument("--base-url", default=ARK_BASE)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    key = _ark_key()
    if not key:
        print(f"ERROR: no apiKey for provider {PROVIDER} in {OPENCLAW_CONFIG}", file=sys.stderr)
        return 2

    suite = MultimodalSuite()
    samples = [s for s in suite.load_samples() if s.get("attack_type") == "vision_image"]
    if args.limit:
        samples = samples[: args.limit]

    target = OpenAITarget(model=args.model, api_key=key, base_url=args.base_url, max_tokens=300)
    check = MultimodalCheck()

    print(f"Probing {len(samples)} sample(s) × 3 forms on {args.model} via {args.base_url} …",
          file=sys.stderr)
    results = [run_probe(s, target, check) for s in samples]
    summary = summarize_probes(results)

    report = {"model": args.model, "base_url": args.base_url, "summary": summary, "results": results}
    out = args.out or f"validation/vision-probe-{args.model}.json"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\nWrote {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
