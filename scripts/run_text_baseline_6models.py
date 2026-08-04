#!/usr/bin/env python3
"""平凡基线对照实验 — 6 视觉模型在纯文本直注下的 bypass 率。

这是复赛参照系第①层(平凡基线),与 expB(真视觉 expB-render-*.json)直接对照。
回答评委问题:"doubao-lite 视觉 bypass 46.7%,纯文本直注 bypass 多少?"
若纯文本也高 → 模型本身弱,非通道效应;若纯文本低 → 视觉通道放大了 bypass。

对每个模型跑 h_test_120 的 plain_text 形态(同一 payload,纯文本送入)。
输出 validation/text-baseline-{model}.json,格式与 expB 一致(含 A/B/C)。
支持 resume(已完成的 sample 跳过)。
"""
from __future__ import annotations
import json, os, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from agent_redteam.suites.multimodal import MultimodalCheck
from agent_redteam.targets.openai_compat import OpenAITarget
from agent_redteam.vision_probe import run_probe, summarize_probes, summarize_channels, build_delivery_forms

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

TEXT_FORMS = ("plain_text",)

def _save(out, label, model_id, results):
    summ = summarize_probes(results, TEXT_FORMS)
    # 注:plain_text 形态下 run_probe 不算 channel_class/perception(纯文本无"没读到"问题),
    # 故 channel_decomposition 对 plain_text 全为 0,属正常。基线对照核心指标是 bypass_rate。
    summ["channel_decomposition_note"] = "plain_text 无 A 层(指令明文,模型必读到),仅 B/C 区分,channel_class 不适用"
    json.dump({"experiment": "text_baseline_control", "label": label, "model": model_id,
               "summary": summ, "results": results},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

def main():
    samples = [json.loads(l) for l in open(SAMPLES, encoding="utf-8") if l.strip()]
    check = MultimodalCheck()
    for label, model_id, base, key in _models():
        out = os.path.join(HERE, "..", "validation", f"text-baseline-{label}.json")
        done = {}
        if os.path.exists(out):
            prev = json.load(open(out, encoding="utf-8"))
            done = {r["sample_id"]: r for r in prev.get("results", [])}
        target = OpenAITarget(model=model_id, api_key=key, base_url=base, max_tokens=300)
        results = []
        for i, s in enumerate(samples):
            if s["id"] in done:
                results.append(done[s["id"]]); continue
            try:
                r = run_probe(s, target, check, forms=TEXT_FORMS, form_builder=build_delivery_forms)
            except Exception as e:
                r = {"sample_id": s["id"], "forms": {"plain_text": {"verdict": "error", "bypassed": False,
                         "error": str(e)[:100], "perception": 0, "channel_class": "error"}}}
            results.append(r)
            _save(out, label, model_id, results)
            status = r.get("forms",{}).get("plain_text",{}).get("verdict","?")
            print(f"[{label}] {i+1}/{len(samples)} {s['id']} -> {status}", file=sys.stderr)
            time.sleep(0.3)  # 避免限流
        _save(out, label, model_id, results)
        summ = summarize_probes(results, TEXT_FORMS)
        print(f"=== {label} plain_text bypass: {summ.get('bypass_rate_by_form',{})}", file=sys.stderr)
    print("DONE text baseline", file=sys.stderr)

if __name__ == "__main__":
    main()
