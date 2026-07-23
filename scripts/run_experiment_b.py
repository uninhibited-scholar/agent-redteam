#!/usr/bin/env python3
"""Experiment B — render-form comparison across all free vision models.

For each of the 120 balanced harmful payloads, render three ways
(image_plain / image_lowcon@gray140 / image_watermark) and score execution +
A/B/C perception. Runs every free vision model; per-model output with resume
(skips (sample_id, form) already scored, so an interrupted background run
continues where it left off).

All models are free: 智谱 free tier + 火山 coding plan (never the metered api/v3).
Keys read from config files, never printed.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from agent_redteam.suites.multimodal import MultimodalCheck
from agent_redteam.targets.openai_compat import OpenAITarget
from agent_redteam.vision_probe import (
    run_probe, summarize_probes, summarize_channels, build_render_forms, RENDER_FORMS,
)

HERE = os.path.dirname(__file__)
SAMPLES = os.path.join(HERE, "..", "validation", "h_test_120.jsonl")
OPENCLAW = os.path.expanduser("~/.openclaw/openclaw.json")
AGENT_CFG = os.path.expanduser("~/.agent-redteam/config")
ARK = "https://ark.cn-beijing.volces.com/api/coding/v3"
ZHIPU = "https://open.bigmodel.cn/api/paas/v4"


def _ark_key():
    return json.load(open(OPENCLAW))["models"]["providers"]["custom-ark-cn-beijing-volces-com"]["apiKey"]

def _zhipu_key():
    return [l.split(":", 1)[1].strip() for l in open(AGENT_CFG) if l.startswith("api_key")][0]

# (label, model_id, base_url, key)
def _models():
    ak, zk = _ark_key(), _zhipu_key()
    return [
        ("glm-4v-flash", "glm-4v-flash", ZHIPU, zk),
        ("doubao-2.0-pro", "doubao-seed-2-0-pro-260215", ARK, ak),
        ("doubao-2.0-lite", "doubao-seed-2-0-lite-260215", ARK, ak),
        ("doubao-2.0-code", "doubao-seed-2-0-code-preview-260215", ARK, ak),
        ("kimi-k2-7", "kimi-k2-7-code-260601", ARK, ak),
        ("minimax-m3", "minimax-m3-modelhub", ARK, ak),
    ]


def main():
    samples = [json.loads(l) for l in open(SAMPLES, encoding="utf-8") if l.strip()]
    check = MultimodalCheck()
    for label, model_id, base, key in _models():
        out = os.path.join(HERE, "..", "validation", f"expB-render-{label}.json")
        done = {}
        if os.path.exists(out):
            prev = json.load(open(out, encoding="utf-8"))
            done = {r["sample_id"]: r for r in prev.get("results", [])}
        target = OpenAITarget(model=model_id, api_key=key, base_url=base, max_tokens=300)
        results = []
        for i, s in enumerate(samples):
            if s["id"] in done:
                results.append(done[s["id"]]); continue
            r = run_probe(s, target, check, forms=RENDER_FORMS, form_builder=build_render_forms)
            results.append(r)
            # incremental save (resume-safe)
            _save(out, label, model_id, results)
            print(f"[{label}] {i+1}/{len(samples)} {s['id']}", file=sys.stderr)
        _save(out, label, model_id, results)
        summ = summarize_probes(results, RENDER_FORMS)
        print(f"=== {label}: {summ['bypass_rate_by_form']}", file=sys.stderr)
    print("DONE experiment B", file=sys.stderr)


def _save(out, label, model_id, results):
    summ = summarize_probes(results, RENDER_FORMS)
    summ["channel_decomposition"] = {f: summarize_channels(results, f) for f in RENDER_FORMS}
    json.dump({"experiment": "B_render_form", "label": label, "model": model_id,
               "summary": summ, "results": results},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
