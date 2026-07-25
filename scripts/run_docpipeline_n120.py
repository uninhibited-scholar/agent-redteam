#!/usr/bin/env python3
"""§6.2 upgrade — plain_text vs doc_pipeline at N=120 on the paper's two models.

Runs the text-channel delivery comparison (plain_text vs doc_pipeline = SVG-as-
text, the paper's "multimodal" method) on the 120 balanced harmful set, for
GLM-5.2 (zcode z.ai coding plan) and DeepSeek-v4 (Volcengine coding plan). Both
free/flat. Upgrades the earlier n=11 pilot to a statistically meaningful N=120.
Resume-safe, keys read from config (never printed).
"""
from __future__ import annotations

import json, math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from agent_redteam.suites.multimodal import MultimodalCheck
from agent_redteam.targets.zai_target import ZaiTarget
from agent_redteam.targets.openai_compat import OpenAITarget
from agent_redteam.vision_probe import run_probe, build_delivery_forms

HERE = os.path.dirname(__file__)
SAMPLES = os.path.join(HERE, "..", "validation", "h_test_120.jsonl")
FORMS = ("plain_text", "doc_pipeline")


def _zcode_zai_key():
    cfg = json.load(open(os.path.expanduser("~/.zcode/v2/config.json")))
    return cfg["provider"]["builtin:zai"]["options"]["apiKey"]

def _ark_key():
    return json.load(open(os.path.expanduser("~/.openclaw/openclaw.json")))["models"]["providers"]["custom-ark-cn-beijing-volces-com"]["apiKey"]

def _wilson(k, n, z=1.96):
    if not n: return [None, None]
    p = k/n; d = 1+z*z/n; c = (p+z*z/(2*n))/d; h = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return [round(100*(c-h), 1), round(100*(c+h), 1)]


def main():
    samples = [json.loads(l) for l in open(SAMPLES, encoding="utf-8") if l.strip()]
    check = MultimodalCheck()
    models = [
        ("GLM-5.2", ZaiTarget(model="GLM-5.2", api_key=_zcode_zai_key(),
                              base_url="https://api.z.ai/api/anthropic", max_tokens=300)),
        ("DeepSeek-v4", OpenAITarget(model="deepseek-v4-flash-260425", api_key=_ark_key(),
                                     base_url="https://ark.cn-beijing.volces.com/api/coding/v3", max_tokens=300)),
    ]
    summary_out = {}
    for label, target in models:
        out = os.path.join(HERE, "..", "validation", f"docpipeline-n120-{label}.json")
        done = {}
        if os.path.exists(out):
            done = {r["sample_id"]: r for r in json.load(open(out, encoding="utf-8")).get("results", [])}
        results = []
        for i, s in enumerate(samples):
            if s["id"] in done:
                results.append(done[s["id"]]); continue
            results.append(run_probe(s, target, check, forms=FORMS, form_builder=build_delivery_forms))
            _save(out, label, results)
            print(f"[{label}] {i+1}/{len(samples)}", file=sys.stderr)
        _save(out, label, results)
        summ = _summ(results)
        summary_out[label] = summ
        print(f"=== {label}: {summ}", file=sys.stderr)
    json.dump(summary_out, open(os.path.join(HERE, "..", "validation", "docpipeline-n120-SUMMARY.json"), "w"),
              ensure_ascii=False, indent=2)
    print("DONE docpipeline N=120", file=sys.stderr)


def _summ(results):
    o = {}
    for form in FORMS:
        j = [r for r in results if r["forms"].get(form, {}).get("verdict") in ("pass", "fail")]
        n = len(j); k = sum(1 for r in j if r["forms"][form]["bypassed"])
        o[form] = {"k": k, "n": n, "bypass_pct": round(100*k/n, 1) if n else None, "wilson95": _wilson(k, n)}
    return o


def _save(out, label, results):
    json.dump({"experiment": "docpipeline_n120", "model": label, "forms": list(FORMS),
               "summary": _summ(results), "results": results},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
