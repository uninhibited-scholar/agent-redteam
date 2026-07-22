#!/usr/bin/env python3
"""Run the §2.8 representation-layer probe against a real VLM.

One command to produce the first true vision-channel data once a vision model
is reachable. It sends every ``vision_image`` sample in three forms
(text_only / ocr_text / image_only) and reports per-form bypass rates plus how
many samples support the channel-localization hypothesis H.

Config (the API key is READ, never printed):
    api_key    ~/.agent-redteam/config  (key: api_key)  or env ZAI_API_KEY / OPENAI_API_KEY
    base_url   env VISION_BASE_URL   (default: Z.ai OpenAI-compatible v4 endpoint)
    model      env VISION_MODEL      (default: glm-4v-flash — a cheap GLM vision model)

Usage:
    VISION_MODEL=glm-4v-flash python scripts/run_vision_probe.py
    python scripts/run_vision_probe.py --limit 3          # smoke test, 3 samples
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from agent_redteam.core.config import load_default_profile
from agent_redteam.suites.multimodal import MultimodalSuite, MultimodalCheck
from agent_redteam.targets.openai_compat import OpenAITarget
from agent_redteam.vision_probe import run_probe, summarize_probes

DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"


def _resolve_key() -> str:
    cfg = load_default_profile()
    return (
        cfg.get("api_key")
        or os.environ.get("ZAI_API_KEY", "")
        or os.environ.get("OPENAI_API_KEY", "")
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Run the §2.8 vision-channel probe.")
    ap.add_argument("--limit", type=int, default=None, help="only probe the first N samples (smoke test)")
    ap.add_argument("--model", default=os.environ.get("VISION_MODEL", "glm-4v-flash"))
    ap.add_argument("--base-url", default=os.environ.get("VISION_BASE_URL", DEFAULT_BASE_URL))
    ap.add_argument("--out", default=None, help="output JSON path")
    args = ap.parse_args(argv)

    key = _resolve_key()
    if not key:
        print("ERROR: no API key found (~/.agent-redteam/config api_key, or ZAI_API_KEY/OPENAI_API_KEY).",
              file=sys.stderr)
        return 2

    suite = MultimodalSuite()
    samples = [s for s in suite.load_samples() if s.get("attack_type") == "vision_image"]
    if args.limit:
        samples = samples[: args.limit]
    if not samples:
        print("ERROR: no vision_image samples found.", file=sys.stderr)
        return 2

    target = OpenAITarget(model=args.model, api_key=key, base_url=args.base_url, max_tokens=300)
    check = MultimodalCheck()

    print(f"Probing {len(samples)} vision_image sample(s) on model={args.model} "
          f"via {args.base_url} …", file=sys.stderr)
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
