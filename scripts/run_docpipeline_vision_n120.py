#!/usr/bin/env python3
"""§4.2b upgrade — plain_text vs doc_pipeline on the SIX VISION models, N=120.

The paper's §4.2 headline (doc_pipeline collapses bypass) was measured on two
TEXT-ONLY models (GLM-5.2, DeepSeek-V4). A separate N=31 pilot on two VISION
models (glm-4v-flash, doubao-2.0-pro) showed a messier, model-dependent picture
that does not cleanly extend the text-only finding. This script closes that gap:
runs plain_text + doc_pipeline on the same 120-sample balanced set, on all six
vision models, so they can be directly compared against their own already-
collected image_plain numbers (validation/expB-render-*.json) for a true
apples-to-apples three-way channel comparison per model.

Free/flat-rate only (智谱 free + 火山 coding plan). Resume-safe.
"""
from __future__ import annotations

import json, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from agent_redteam.suites.multimodal import MultimodalCheck
from agent_redteam.targets.openai_compat import OpenAITarget
from agent_redteam.vision_probe import run_probe, build_delivery_forms

HERE = os.path.dirname(__file__)
SAMPLES = os.path.join(HERE, "..", "validation", "h_test_120.jsonl")
OPENCLAW = os.path.expanduser("~/.openclaw/openclaw.json")
AGENT_CFG = os.path.expanduser("~/.agent-redteam/config")
ARK = "https://ark.cn-beijing.volces.com/api/coding/v3"
ZHIPU = "https://open.bigmodel.cn/api/paas/v4"
FORMS = ("plain_text", "doc_pipeline")


def _ark_key():
    return json.load(open(OPENCLAW))["models"]["providers"]["custom-ark-cn-beijing-volces-com"]["apiKey"]

def _zhipu_key():
    return [l.split(":", 1)[1].strip() for l in open(AGENT_CFG) if l.startswith("api_key")][0]

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


def _summ(results):
    o = {}
    for form in FORMS:
        j = [r for r in results if r["forms"].get(form, {}).get("verdict") in ("pass", "fail")]
        n = len(j); k = sum(1 for r in j if r["forms"][form]["bypassed"])
        o[form] = {"k": k, "n": n, "bypass_pct": round(100*k/n, 1) if n else None}
    return o


def _save(out, label, model_id, results):
    json.dump({"experiment": "docpipeline_vision_n120", "label": label, "model": model_id,
               "summary": _summ(results), "results": results},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def main():
    samples = [json.loads(l) for l in open(SAMPLES, encoding="utf-8") if l.strip()]
    check = MultimodalCheck()
    for label, model_id, base, key in _models():
        out = os.path.join(HERE, "..", "validation", f"docpipeline-vision-n120-{label}.json")
        done = {}
        if os.path.exists(out):
            done = {r["sample_id"]: r for r in json.load(open(out, encoding="utf-8")).get("results", [])}
        target = OpenAITarget(model=model_id, api_key=key, base_url=base, max_tokens=300)
        results = []
        for i, s in enumerate(samples):
            if s["id"] in done:
                results.append(done[s["id"]]); continue
            results.append(run_probe(s, target, check, forms=FORMS, form_builder=build_delivery_forms))
            _save(out, label, model_id, results)
            print(f"[{label}] {i+1}/{len(samples)}", file=sys.stderr)
        _save(out, label, model_id, results)
        print(f"=== {label}: {_summ(results)}", file=sys.stderr)
    print("DONE docpipeline_vision_n120", file=sys.stderr)


if __name__ == "__main__":
    main()
