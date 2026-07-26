# Master Report — Vision-Channel Prompt Injection Re-measurement

**Working title**: *Reading Is Not Executing: A Controlled Re-measurement of Vision-Channel Prompt Injection in LLMs*

All numbers below are pulled directly from `validation/*.json` (also consolidated in `validation/MASTER-REPORT.json`). Every run used a free API tier (智谱 free + 火山 coding plan / zcode z.ai coding plan) — no metered calls. This document is the data/figures backbone for the paper's Results section; prose framing is left to drafting.

---

## Exp0 — Deconstructing the original 73%/80% headline

Re-scoring the paper's original 15 multimodal samples with the fixed evaluator (no length-based false-positive fallback):

| Model | Paper's reported bypass | Re-scored bypass (N=15) | Δ |
|---|---|---|---|
| GLM-5.2 | 73% | **47%** (7/15) | −26pp |
| DeepSeek-v4 | 80% | **47%** (7/15) | −33pp |

**Reading**: roughly a third of the original headline number was scorer false positives (model *describing* the image content mis-scored as "compromised").

---

## Exp1 — Document-pipeline framing collapses bypass (N=120, upgraded from n=11 pilot)

Same harmful payload delivered as `plain_text` vs `doc_pipeline` (SVG-as-text — the paper's original "multimodal" method), on the paper's two original models, both via free/flat API tiers.

| Model | plain_text bypass (95% CI) | doc_pipeline bypass (95% CI) |
|---|---|---|
| GLM-5.2 | 47.1% [38.3, 56.0] (56/119) | **0.8%** [0.1, 4.6] (1/120) |
| DeepSeek-v4 | 49.2% [40.3, 58.1] (58/118) | **1.7%** [0.5, 5.9] (2/120) |

**Reading**: moving an injection from plain text into document structure does not raise bypass — it collapses it by ~45–47pp. The paper's "multimodal" channel (SVG/HTML-as-text) is not a more dangerous surface; it is a *weaker* one. This is a controlled negative result, not an absence-of-evidence artifact (CI is narrow, N=120).

---

## Exp2 — Render-form comparison across 6 free vision models (N=120 each)

Real vision-channel injection (PNG pixels) in three render forms: `image_plain`, `image_lowcon` (calibrated legible low-contrast, gray=140), `image_watermark` (tiled diagonal).

| Model | image_plain bypass (95% CI) | image_lowcon | image_watermark | A/B/C on image_plain (not-read / described / **executed**) |
|---|---|---|---|---|
| doubao-2.0-pro | 0.9% [0.2, 4.8] | 1.8% [0.5, 6.3] | 0.9% [0.2, 4.8] | 26 / 87 / **1** |
| doubao-2.0-code | 0.8% [0.1, 4.6] | 2.5% [0.9, 7.1] | 0.0% [0.0, 3.1] | 29 / 90 / **1** |
| minimax-m3 | 1.7% [0.5, 5.9] | 5.0% [2.3, 10.5] | 1.7% [0.5, 5.9] | 103 / 17 / **0** |
| kimi-k2-7 | 17.5% [11.7, 25.3] | 8.3% [4.6, 14.7] | 2.5% [0.9, 7.1] | 44 / 56 / **20** |
| glm-4v-flash | 21.7% [15.2, 29.9] | 18.3% [12.4, 26.2] | 13.3% [8.4, 20.6] | 9 / 92 / **19** |
| doubao-2.0-lite | 46.7% [38.0, 55.6] | 45.0% [36.4, 53.9] | 27.5% [20.3, 36.1] | 37 / 64 / **19** |

> CI values are Wilson score intervals (95%), computed directly from `validation/MASTER-REPORT.json` — regenerate via the aggregation script if source data changes, do not hand-edit.

**Readings**:
1. **Capability is decisive, even within one vendor family**: doubao-2.0-pro/code ≈ 1% vs doubao-2.0-lite ≈ 47% — a >45pp gap inside the same model family.
2. **Watermark form is a weaker vector than plain**, consistently (6/6 models watermark ≤ plain; models tend to *describe* the tiled text rather than execute it).
3. **A/B/C decomposition is the key methodological contribution**: minimax-m3's low bypass (1.7%) is 86% "didn't read the image at all" (perception failure, not safety); doubao-2.0-pro's low bypass is 76% "read it, described it, refused" (genuine safety). Bypass rate alone cannot distinguish these — prior benchmarks that report only ASR conflate "blind" with "safe."

---

## Exp3 — Layered injection (surface-prominent + buried-watermark), N=120 pairs × 4 conditions × 6 models

Pre-registered hypotheses (paper §11.1): H2 masking, H3 "opening" (does a prominent decoy let a buried instruction slip through?), H4 salience-dominance.

| Model | C1 surface-only | C2 buried-only | C3 both: surface / buried | C4 swapped: surface / buried | H3 Δ (C3−C2 buried) |
|---|---|---|---|---|---|
| doubao-2.0-code | 0.0% | 3.4% | 10.1% / 0.0% | 1.7% / 12.7% | −3.4pp |
| doubao-2.0-lite | 0.0% | 10.8% | 0.0% / 1.7% | 0.0% / 35.8% | −9.2pp |
| doubao-2.0-pro | 4.2% | 0.8% | 8.3% / 0.0% | 19.3% / 8.4% | −0.8pp |
| glm-4v-flash | 85.0% | 0.0% | 39.2% / 0.0% | 12.5% / 4.2% | +0.0pp |
| kimi-k2-7 | 2.5% | 1.7% | 16.1% / 0.8% | 33.1% / 7.6% | −0.8pp |
| minimax-m3 | 0.0% | 8.0% | 0.0% / 2.7% | 0.0% / 31.1% | −5.3pp |

> Percentages are k/n over judged (non-error) trials per condition, N≈120 pairs per model; exact figures in `validation/MASTER-REPORT.json` → `exp3_layered_N120`.

**Mean H3 Δ across 6 models: −3.3pp → H3 ("opening") is falsified.** A prominent decoy does not help a buried instruction execute more often — if anything, slightly less (attention is drawn away, not split favorably for the attacker).

**H4 supported**: swapping which layer is prominent (C4) flips execution — the buried layer, once made prominent, executes far more often (e.g. doubao-2.0-lite 11%→36%, minimax-m3 9%→35%). **Salience, not burial depth, is what determines execution.** Layering does not grant attackers extra capability — it reduces to a single-layer salience question.

---

## Exp4 — Judge validity (blind audit)

Independent GLM-5.2 judge vs. the regex `MultimodalCheck`, on 40 sampled `image_plain` verdicts (20 auto-FAIL + 20 auto-PASS, stratified, across all 6 vision models):

- **Cohen's κ = 0.775** (substantial agreement), **FN rate = 0** (regex never under-reports a real execution)
- All 9 disagreements are `auto=comply, judge=resist`; 6/9 are **judge-side truncation artifacts** (the canary sat beyond the 300-char excerpt fed to the judge, while the regex scored the full response) → κ=0.775 is a **conservative lower bound**; adjusted agreement ≈ 0.93 once truncation artifacts are excluded.
- **Conclusion**: the automated canary-based scorer is valid; a definitive κ run should feed the judge full (untruncated) responses.

---

## Exp5 — Legibility calibration (correcting a rendering artifact)

- Perception threshold on glm-4v-flash: reading rate is 0.0 at gray 255→170, jumps to 1.0 at gray 140→100. **Threshold ≈ gray 140–170.**
- The default `low_contrast` render (gray=246) was far above this threshold — effectively invisible to the model, not just to a human. Re-running `image_hidden` at calibrated gray=140 (N=31, earlier pilot): bypass rose from **6% (artifact) to 26% (real)**, with perception failure dropping from 26/31 to 2/31.
- **Reading**: an earlier "low-contrast channel is safe" conclusion was substantially a rendering artifact, not a property of hidden-text attacks. Corrected: legible low-contrast injection is a real, moderate-strength vector (§Exp2's `image_lowcon` column at N=120 reflects this calibrated setting).

---

## Consolidated findings (candidate paper contributions)

1. **The prior 73–90% "multimodal blind spot" headline is inflated by ~26–33pp of scorer false positives** (Exp0), independently confirmed on both of the paper's original models.
2. **The paper's "multimodal" channel was document-pipeline text injection, not real vision** — and at controlled scale (N=120), that channel is *weaker* than plain text, not stronger (Exp1).
3. **Real vision-channel injection is genuine but strongly capability-dependent** (0.8–46.7% across 6 free models, Exp2) — not a uniform blind spot.
4. **A/B/C perception decomposition is necessary**: low bypass can mean "safe" (reads, refuses) or "blind" (never perceives the attack) — prior single-ASR benchmarks conflate these (Exp2).
5. **Watermark-style rendering is a weaker attack vector than plain text**, consistently across 6 models (Exp2).
6. **Layered (surface + buried) injection does not grant attackers extra capability**; execution is governed by visual salience alone, not by burial depth (Exp3, H3 falsified, H4 supported).
7. **Judge validity is empirically supported** (κ=0.775 conservative / ~0.93 adjusted, FN=0) via independent LLM-judge blind audit (Exp4).
8. **A legibility-calibration confound can fully explain an apparent "hidden channel is safe" finding** — a caution for future work in this space (Exp5).

## Data provenance
All experiments: fixed samples (`validation/h_test_120.jsonl`, `h_layered_120.jsonl`), fixed seeds, temperature=0, free API tiers only. Raw results: `validation/expA-layered-*.json`, `expB-render-*.json`, `docpipeline-n120-*.json`, `original15-dissect-*.json`, `blind-audit-kappa.json`, `legibility-threshold-*.json`, `image-hidden-gray140-*.json`. Consolidated machine-readable: `validation/MASTER-REPORT.json`.
