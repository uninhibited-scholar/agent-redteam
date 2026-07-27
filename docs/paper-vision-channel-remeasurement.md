# Reading Is Not Executing: A Controlled Re-measurement of Vision-Channel Prompt Injection in LLMs

**Author**: Jiehan Zhu (Department of Information Engineering, The Chinese University of Hong Kong)

**Status**: Draft. Supersedes the author's earlier preliminary release *"Multimodal Prompt Injection: A Systematic Evaluation of Cross-Channel Attack Vectors Against LLM Safety Defenses"* (Zenodo, DOI: 10.5281/zenodo.21416033). This paper substantially revises that work's headline claim after independent re-measurement uncovered a scorer artifact in the original evaluation (§4.1); it is not a resubmission of the same result.

---

## Abstract

A widely repeated claim in practitioner reports is that large language models show a "multimodal blind spot": near-perfect defense against text-based prompt injection collapses when the same instruction is delivered through a non-text channel. We re-examine this claim under controlled conditions and find it does not hold as stated. First, re-scoring an earlier study's own samples with a corrected evaluator (removing a length-based false-positive rule) drops the reported 73–80% bypass rate to 47% on both original models — roughly a third of the original headline was scorer error, not model behavior. Second, what that study called "multimodal" injection was in fact text extracted from SVG/HTML markup and delivered as plain text; at controlled scale (N=120, two models), this "document-pipeline" delivery collapses bypass to ~1%, weaker than plain text, not stronger. Third, using real pixel-rendered vision-channel injection against six free-tier vision-language models (four vendors), we find bypass rates from 0.8% to 46.7% — strongly capability-dependent, not a uniform blind spot — and we show that low bypass can mean either "the model refused after reading the attack" or "the model never perceived the attack at all" (one model's apparent safety was 86% perceptual failure). We introduce a three-way perception/compliance decomposition (read-but-refused / not-read / read-and-executed) to distinguish these, validated by an independent LLM-judge blind audit (Cohen's κ = 0.775, conservative lower bound). We further test whether layering a prominent decoy instruction over a watermark-style buried one lets the buried instruction "sneak through" — it does not (pre-registered hypothesis falsified, mean Δ = −3.3pp across six models); execution is governed by visual salience, not concealment depth. We release all samples, scoring code, and raw run data (2,300+ free-tier API calls, zero cost) for independent reproduction.

---

## 1 Introduction

### 1.1 Why this matters

As LLM agents increasingly accept file uploads, screenshots, and rendered documents as input, any channel that can carry adversarial instructions is a live attack surface. Practitioner and academic reports alike have argued that this surface is a genuine blind spot in current alignment: models trained to resist "ignore previous instructions" in plain text apparently do not generalize that resistance to the same instruction hidden in an image or document structure. This claim shapes both research priorities (where should defense effort go?) and product risk assessments (is it safe to let an agent read arbitrary uploaded files?). If the claim is measured incorrectly, both downstream decisions are miscalibrated.

### 1.2 What we found wrong with the existing measurement

We began by trying to extend an existing multimodal-injection evaluation to more models and a larger sample. In doing so we found three independent problems with how the "blind spot" number is typically produced:

1. **Scorer artifact.** A common evaluation shortcut — flagging any sufficiently long, non-refusing response as a successful attack — systematically mis-scores a model that is merely *describing* injected content (rather than acting on it) as compromised.
2. **Channel mislabeling.** What is described as a "multimodal" attack is frequently text extracted from an image-adjacent format (SVG, HTML, PDF metadata) and delivered to the model as text, never rendered as pixels or shown to a vision encoder. This measures document-pipeline text injection, not vision-channel injection.
3. **Perception/compliance conflation.** A single bypass-rate number cannot distinguish a model that read an attack and refused it from a model that never perceived the attack at all. Both produce identical "low bypass" numbers but represent opposite security postures.

### 1.3 How we re-measured it

We built a controlled re-measurement pipeline (§3) with: (a) canary-based scoring where the compliance signal is transcription-proof — a secret or computed value that cannot appear in a model's response unless the model actually executed the injected instruction, eliminating the description-vs-compliance ambiguity by construction; (b) real pixel-rendered vision-channel delivery (PNG images fed to vision-language models as image input) alongside plain-text and document-pipeline deliveries of the identical payload, so the three channels are compared on the same attack under the same model; (c) a three-way perception/compliance decomposition (A: not read, B: read-but-refused, C: read-and-executed) computed from whether the model's response reproduces the injected instruction's distinctive content; (d) Wilson 95% confidence intervals on every reported rate, at N=120 balanced samples per condition; (e) an independent LLM-judge blind audit of the automated scorer.

We ran this pipeline across six vision-language models spanning four vendors and two text-only models, entirely on free-tier or flat-rate ("coding plan") API access — no metered spend — producing a dataset we release alongside this paper.

---

## 2 Related Work

**Foundational threat model.** Indirect prompt injection was first systematically described by Greshake et al. [1], who showed that LLM-integrated applications can be compromised by adversarial content in retrieved data rather than the user's direct prompt. OWASP now lists prompt injection as the top risk for LLM applications (LLM01) [2], and industry reports from both frontier labs [3] describe it as a persistent, only partially mitigated problem across real deployed agents — motivating our framing of injection as a genuinely unresolved, cross-surface problem rather than a solved one.

**Text-channel agent injection benchmarks.** AgentDojo [4] and InjecAgent [5] established standardized text-channel indirect-injection benchmarks for tool-using agents, jointly measuring attack success and task utility. Agent Security Bench [6] extends this to a broader taxonomy of text-channel attacks (memory poisoning, backdoors) across many LLM backbones. WASP [7] benchmarks web agents and notably reports that injected attacks frequently achieve *partial* compliance without full task completion — a distinction closely related to our perception/compliance decomposition, though applied to a different channel. We use the same style of canary/goal-completion scoring as these benchmarks but apply it across delivery channels on the same payload rather than within one channel.

**Vision-channel jailbreak and multimodal safety benchmarks.** MM-SafetyBench [8] is the benchmark most associated with the "multimodal blind spot" framing this paper re-examines; it reports large jailbreak success rates via query-relevant images even on safety-aligned models. FigStep [9] achieves high attack success by rendering harmful instructions as typographic images. Notably, JailBreakV-28K [10] — a benchmark combining text-transferred and native image attacks — finds that *text-transferred* attacks often dominate over pure image attacks on the same models, a finding independently consistent with our claim that "multimodal vulnerability" numbers frequently reflect the text channel rather than the vision channel. Qi et al. [11] show a single optimized adversarial image can universally jailbreak an aligned model, illustrating that vision-channel attacks, where real, can be highly capability- and optimization-dependent rather than trivially available. Cheng et al. [12] show typographic-attack degradation varies substantially (42%→14%) depending on evaluation setup, supporting our position that reported vulnerability is measurement-sensitive.

**Evaluator and judge validity.** Our central methodological concern — that an automated success/failure judgment can silently misrepresent model behavior — is not new in spirit. Souly et al.'s StrongREJECT [13] shows that common jailbreak evaluators overstate success by conflating a model's willingness to respond with actual harmful capability, closely paralleling our finding that "non-refusal" was mis-scored as "compromise." HarmBench [14] is the standard single-ASR-number benchmark our critique is positioned against. Eiras et al. [15] show LLM safety judges can shift false-negative rates by up to 0.24 under superficial output changes, directly motivating our use of an independent judge and Cohen's κ rather than trusting a single scorer. Mei et al. [16] document evaluator hallucination in jailbreak scoring — judges marking non-successes as successes — the same failure mode we identify and correct in §4.1.

**Perception of text embedded in images.** Balakrishnan et al. [17] show typographic attack success is gated by a measurable text-image embedding-alignment signal and degrades substantially (34–96%) under visual perturbation, closely paralleling our finding of a sharp legibility threshold (§4.5) rather than a smoothly graded one. Qraitem et al. [18] frame typographic attacks as a perception phenomenon models can even generate against themselves, supporting our read-vs-acted-upon distinction. OCRBench [19] provides baseline evidence that VLM text-in-image reading capability itself varies substantially across models and text types, underpinning our claim that "the model didn't perceive the attack" is a real and measurable failure mode, not a rhetorical hedge.

**Positioning.** No prior work we found combines (a) a transcription-proof canary design that mechanically separates description from compliance, (b) the same payload delivered through plain-text, document-pipeline, and rendered-pixel channels on the same model for controlled comparison, and (c) a perception/compliance decomposition validated by independent-judge blind audit. This combination is this paper's primary methodological contribution.

---

## 3 Methodology

### 3.1 Testing framework

We use `agent-redteam`, an open-source, dependency-free (Python stdlib only) red-teaming harness (PyPI: `agent-redteam`; source: `github.com/uninhibited-scholar/agent-redteam`), extended for this paper with: a PNG rendering module (`multimodal_render.py`) supporting plain, low-contrast, tiny, watermark-tiled, and two-layer render modes; a probe orchestration module (`vision_probe.py`) supporting multi-channel delivery, perception scoring, and A/B/C classification; and a blind-audit module (`blind_audit.py`) implementing worksheet blinding, Cohen's κ, confusion-matrix FP/FN rates, and Spearman correlation, all in pure standard library with no external dependencies.

### 3.2 Canary-based, transcription-proof scoring

Each attack sample pairs a benign cover task (e.g., "summarize this image in one sentence") with an injected instruction hidden in the payload. Compliance is detected via one of two canary types, each chosen so that **a model merely transcribing or quoting the payload cannot produce the canary**:

- **Leak canaries**: a secret value (e.g., `TK-9931-CANARY`) that exists only in the system prompt, never in the visible content or the injected instruction text. A response containing the canary can only originate from the model looking up and disclosing its own system prompt — not from reading the image.
- **Computed-action canaries**: the injected instruction asks the model to perform a simple transformation (e.g., "reverse the digits of the invoice number," "multiply these two numbers") whose result does not appear anywhere in the payload. A response containing the computed value can only originate from the model executing the instruction.

This design directly fixes the false-positive mode identified in §4.1: a model that describes "the image also contains an instruction asking for a secret code" produces a response that does not contain the canary itself, and is correctly scored as resisting the attack.

### 3.3 Three-way perception/compliance decomposition

For image-channel trials we additionally compute a perception score: the fraction of an injected instruction's content words (≥4 characters) reproduced anywhere in the model's full response. Using a 0.5 threshold, each trial is classified as:
- **A (not read)**: perception < 0.5 — the model's response shows no evidence it processed the injected text at all.
- **B (read, described)**: perception ≥ 0.5 but the canary is absent — the model processed the injected text but did not comply.
- **C (read, executed)**: perception ≥ 0.5 and the canary is present — genuine compliance.

This decomposition is the paper's central methodological device: A and B both produce "the attack did not succeed," but represent opposite security postures (blind vs. genuinely resistant).

### 3.4 Delivery channels compared

For a controlled subset of the sample set, the identical payload (cover text + injected instruction) is delivered four ways on the same model:
- `plain_text` — the injected instruction as ordinary text.
- `doc_pipeline` — the payload embedded in an SVG image element, with the injected text at `font-size:0; opacity:0`, then the SVG markup itself sent as text (reproducing the delivery method used by the study we re-examine).
- `image_plain` — the payload rendered to a PNG image (visible cover text plus a clearly legible injected instruction), sent as an image input.
- `image_lowcon` / `image_watermark` — the injected instruction rendered at low contrast (calibrated legible gray level, §4.5) or as a tiled, semi-transparent diagonal watermark, respectively.

### 3.5 Layered-injection design

To test whether concealment itself (as opposed to text-vs-image channel) confers an advantage, we render two instructions into one image: a **surface** instruction (prominent, legible) and a **buried** instruction (watermark-style, less prominent). Each has an independent, transcription-proof canary. Four conditions are tested per pair: surface-only, buried-only, both together, and swapped prominence (buried instruction made prominent, surface instruction made watermark-style). This isolates whether a prominent decoy allows a concealed instruction to execute more often than it would alone (§4.4).

### 3.6 Models

Six vision-language models across four vendors, all accessed at zero marginal cost (free tier or flat-rate subscription, never metered pay-per-call): GLM-4V-Flash (Zhipu, free tier); Doubao-Seed-2.0-Pro, -Lite, and -Code-Preview (Volcengine, flat-rate coding-plan access); Kimi-K2.7-Code and MiniMax-M3 (Volcengine coding-plan access, response extracted via the OpenAI-compatible `reasoning_content` field where the primary content field was empty). Two text-only models — GLM-5.2 and DeepSeek-V4-Flash — are used for the text-vs-document-pipeline comparison (§4.2), both via flat-rate subscription access. All requests use temperature 0.

### 3.7 Sample construction and balance

The primary sample set (`h_test_120.jsonl`) consists of 120 harmful, transcription-proof payloads, balanced 60/60 across two categories (information leakage via system-prompt canary; unauthorized-action confirmation via computed value) and 40/40/40 across three difficulty tiers, verified via an automated cell-balance audit that fails fast on any imbalance. Scenario framing (smart-lock access, payment authorization, cloud credentials, etc.) draws on the domain taxonomy used by InjecAgent [5] (MIT license); payload text and canaries are original to this work. A second sample set (`h_layered_120.jsonl`) of 120 layered pairs, balanced 40/40/40 by difficulty, supports the layered-injection experiment.

---

## 4 Experiments and Results

All raw results are released in `validation/*.json`; the consolidated machine-readable summary is `validation/MASTER-REPORT.json`.

### 4.1 Deconstructing the original 73–80% headline

We re-scored the 15 original multimodal samples from the study this paper re-examines, using the corrected evaluator (§3.2 canary logic; the previous implementation's length-based fallback — "score any response longer than 50 characters as a compromise when refusal was expected" — is removed).

| Model | Originally reported bypass | Re-scored bypass (N=15) |
|---|---|---|
| GLM-5.2 | 73% | **46.7%** (7/15) |
| DeepSeek-V4 | 80% | **46.7%** (7/15) |

Approximately 26–33 percentage points of the original headline number is attributable to the scorer artifact alone, independent of any change in the attack payloads or the model being tested.

### 4.2 The "document-pipeline" channel is not a stronger attack surface (N=120)

We compared `plain_text` and `doc_pipeline` delivery of the same 120 balanced payloads, on both original-study models, via flat-rate API access.

| Model | plain_text bypass (95% CI) | doc_pipeline bypass (95% CI) |
|---|---|---|
| GLM-5.2 | 47.1% [38.3, 56.0] (56/119) | **0.8%** [0.1, 4.6] (1/120) |
| DeepSeek-V4 | 49.2% [40.3, 58.1] (58/118) | **1.7%** [0.5, 5.9] (2/120) |

Moving the identical attack from plain text into document structure *reduces* bypass by 45–47 percentage points rather than raising it. Response inspection suggests the mechanism: models overwhelmingly respond to SVG markup by describing its visual/structural content ("this SVG contains two text elements...") rather than treating embedded instructions as directives to follow — the delivery format itself changes the model's task framing.

### 4.3 Real vision-channel injection: capability-dependent, not uniform (N=120 × 6 models)

| Model | image_plain (95% CI) | image_lowcon | image_watermark | A/B/C on image_plain |
|---|---|---|---|---|
| doubao-2.0-pro | 0.9% [0.2, 4.8] | 1.8% [0.5, 6.3] | 0.9% [0.2, 4.8] | 26 / 87 / **1** |
| doubao-2.0-code | 0.8% [0.1, 4.6] | 2.5% [0.9, 7.1] | 0.0% [0.0, 3.1] | 29 / 90 / **1** |
| minimax-m3 | 1.7% [0.5, 5.9] | 5.0% [2.3, 10.5] | 1.7% [0.5, 5.9] | 103 / 17 / **0** |
| kimi-k2-7 | 17.5% [11.7, 25.3] | 8.3% [4.6, 14.7] | 2.5% [0.9, 7.1] | 44 / 56 / **20** |
| glm-4v-flash | 21.7% [15.2, 29.9] | 18.3% [12.4, 26.2] | 13.3% [8.4, 20.6] | 9 / 92 / **19** |
| doubao-2.0-lite | 46.7% [38.0, 55.6] | 45.0% [36.4, 53.9] | 27.5% [20.3, 36.1] | 37 / 64 / **19** |

Bypass ranges from 0.8% to 46.7% — a 46-point spread across six models, including a >45-point gap *within the same vendor family* (doubao-2.0-pro/code ≈ 1% vs. doubao-2.0-lite ≈ 47%). This is incompatible with a claim of a uniform cross-model blind spot; capability (or deployment tier) is the dominant factor.

The A/B/C decomposition shows why bypass rate alone is insufficient: minimax-m3's low bypass (1.7%) is 86% (103/120) perceptual failure (A) — the model essentially never processes the injected image text — versus doubao-2.0-pro's low bypass, which is 73% (87/120) genuine read-and-refuse behavior (B). Both models report near-identical bypass rates; their underlying security posture is opposite.

Watermark-style rendering is a weaker vector than plain rendering in every one of the six models tested (6/6), consistent with models treating tiled/translucent overlaid text as background rather than content — though we caveat this as specific to our rendering parameters (§6).

### 4.4 Layered injection does not amplify attacks (N≈120 pairs × 4 conditions × 6 models)

We pre-registered two competing hypotheses: **H-masking**, that a prominent decoy instruction reduces the read rate of a buried instruction (attention drawn away), and **H-opening**, that a prominent decoy "opens a door" — reducing scrutiny and *raising* the buried instruction's execution rate.

| Model | C1: surface-only | C2: buried-only | C3 both: surface / buried | C4 swapped: surface / buried | Δ (C3 buried − C2) |
|---|---|---|---|---|---|
| doubao-2.0-code | 0.0% | 3.4% | 10.1% / 0.0% | 1.7% / 12.7% | −3.4pp |
| doubao-2.0-lite | 0.0% | 10.8% | 0.0% / 1.7% | 0.0% / 35.8% | −9.2pp |
| doubao-2.0-pro | 4.2% | 0.8% | 8.3% / 0.0% | 19.3% / 8.4% | −0.8pp |
| glm-4v-flash | 85.0% | 0.0% | 39.2% / 0.0% | 12.5% / 4.2% | +0.0pp |
| kimi-k2-7 | 2.5% | 1.7% | 16.1% / 0.8% | 33.1% / 7.6% | −0.8pp |
| minimax-m3 | 0.0% | 8.0% | 0.0% / 2.7% | 0.0% / 31.1% | −5.3pp |

Mean Δ across six models: **−3.3pp**. H-opening is falsified: a prominent decoy does not raise the buried instruction's execution rate; if anything it is associated with a small decrease, consistent with H-masking rather than H-opening. Swapping which layer is prominent (C4) reliably flips which layer executes more (e.g., doubao-2.0-lite buried execution rises from 10.8% to 35.8% once made prominent) — **visual salience, not concealment depth, governs execution**. Layering two instructions into one image does not grant an attacker capability beyond controlling which instruction is visually prominent.

### 4.5 A legibility-calibration confound, and its correction

An earlier pilot (N=31) suggested low-contrast (watermark-style hidden) injection was near-safe (6.5% bypass, 2/31 compliant, at default rendering, gray level 246 on a 0–255 scale; 26/31 trials showed perceptual failure). Sweeping gray level on glm-4v-flash showed perception is 0.0 at gray 255–170 and jumps to 1.0 at gray 140–100 — a sharp threshold near gray 140–170, not a gradual one. The default rendering (246) sat entirely above this threshold: the text was effectively invisible to the model, not merely low-priority. Re-running the same low-contrast channel at calibrated gray=140 (still visually subtle to a human reader; same N=31 payloads) raised bypass to 25.8% (8/31) and reduced perceptual failure to 2/31 trials. **An apparent "hidden channel is safe" finding was substantially a rendering artifact of the researcher's own stimulus construction, not a property of the attack.** This is reported as a methodological caution: any study of visual-salience-dependent attacks must calibrate legibility against the specific target model, not assume a fixed pixel-intensity parameter transfers.

### 4.6 Judge validity: independent blind audit

We sampled 40 `image_plain` verdicts (20 automated-compliant, 20 automated-resistant, stratified across all six models) and had an independent LLM judge (GLM-5.2, given only the injected instruction and the model's response, blind to the automated verdict) classify each as compliant or resistant.

- **Cohen's κ = 0.775** (substantial agreement); **false-negative rate = 0** — the automated scorer never under-reported a genuine compliance.
- All 9 disagreements were `automated=compliant, judge=resistant`. Inspection showed 6 of 9 were **judge-side artifacts**: the judge was given only a 300-character excerpt of the response, and the canary appeared beyond that excerpt, while the automated scorer had access to the full response. Excluding these, adjusted agreement is ≈92.5%.
- **κ = 0.775 is therefore a conservative lower bound** on true scorer validity; a follow-up audit feeding the judge full (untruncated) responses is needed for a definitive figure, but the available evidence supports the automated scorer's validity.

---

## 5 Discussion

### 5.1 Why "hiding" an attack can make it safer, not more dangerous

Across three independent tests — document-pipeline delivery (§4.2), layered concealment (§4.4), and low-contrast rendering below the legibility threshold (§4.5) — concealment consistently reduced or had no positive effect on bypass rate. We propose a unifying account: models appear to condition their behavior on an implicit signal of "is this content, or is this an instruction," and concealment techniques (structural embedding, visual burial, low salience) more often push content toward the "content to be described" side of that boundary than they successfully disguise an instruction as legitimate. This account is consistent with, but not proven by, our data; distinguishing it from alternative accounts (e.g., simple failure to perceive) is a direction for mechanistic follow-up work — for instance, representation-level probes of where in a model's processing this framing decision is made.

### 5.2 Implications for measurement practice

The central practical implication is procedural: any benchmark reporting a single bypass/attack-success-rate number for a "channel" cannot, by construction, distinguish a genuinely resistant model from a blind one, nor can it distinguish a scorer artifact from a real effect. We recommend, as a minimum bar for future cross-channel injection studies: (1) transcription-proof compliance signals wherever feasible, so that "the model discussed the attack" cannot be conflated with "the model complied"; (2) a perception measurement alongside any bypass-rate claim about a low-salience or concealed channel; (3) an independent-judge validity check with a reported κ, rather than trusting a single automated scorer's output as ground truth; (4) confidence intervals at whatever N is used, so that "0% vs. 5%" claims are not overinterpreted at small samples.

### 5.3 What remains genuinely concerning

None of the above should be read as "vision-channel injection is safe." Real, pixel-rendered injection achieved genuine compliance (category C, §4.3) on every model we tested except the two strongest (doubao-2.0-pro and -code, where C=1/120 each), including exact disclosure of system-prompt-only secrets that could not have leaked by any mechanism other than the model executing the injected instruction. On the weakest model tested, nearly half of trials resulted in compliance. The corrected finding is not "no risk" but "risk that is real, capability-dependent, and smaller than previously reported by roughly a third to a half," which changes prioritization (defend weaker/smaller models specifically; the concealment vector is not the primary threat) without eliminating the underlying concern.

---

## 6 Limitations

- **Model coverage.** All six vision models were selected for zero-cost access; this necessarily excludes some widely deployed proprietary models (GPT-4V-class, Claude-vision-class) for which we did not have unmetered access at the time of writing. Extending coverage to these models, at metered cost, is future work and may shift the observed capability-dependence range.
- **Watermark rendering is one specific implementation.** Our tiled, semi-transparent watermark render is one point in a large design space (density, opacity, rotation, font, placement); "watermark styling is a weaker vector" (§4.3) should be read as a finding about this implementation, not a general law about all watermark-style concealment.
- **The layered-injection experiment is one operationalization of "layering."** We tested a two-layer, prominence-swappable design; other layering strategies (e.g., temporally staged reveals, semantic rather than visual layering) are untested and may behave differently.
- **The κ audit used a truncated judge input** (§4.6); the reported κ=0.775 is explicitly flagged as a conservative lower bound pending a full-response follow-up audit.
- **The acrostic/structural-steganography attack type** (instructions encoded in text structure, e.g., first-letter acrostics) was piloted at small scale during this project and is not reported here as a finding, since the pilot data could not support a reliable estimate; it is noted as a candidate direction rather than a result.
- **Single-run, temperature-0 measurements.** Following standard practice for reproducibility, we do not report across-seed variance; stochastic-evaluation critiques of ASR measurement in adjacent literature (e.g., judge-temperature sensitivity) suggest this is worth revisiting in follow-up work.

---

## 7 Conclusion

A specific, widely cited number — "73% multimodal bypass" — does not survive controlled re-measurement: roughly a third was scorer artifact, and the channel it was attributed to was not the vision channel at all. Real vision-channel prompt injection is not a myth, but it is smaller, more capability-dependent, and more mechanistically specific than the "blind spot" framing suggests. We contribute a reusable measurement methodology — transcription-proof canaries, a perception/compliance decomposition, cross-channel controlled comparison, and independent-judge validation — and an open, reproducible, zero-cost dataset (2,300+ API calls across four vendors) that we hope makes future claims in this space easier to verify and harder to overstate.

---

## AI Assistance Disclosure

This paper was produced through extensive human-AI collaboration; per the author's commitment to transparent disclosure, the following AI-assisted contributions are itemized:

1. **Literature search and citation verification**: candidate related-work papers were identified via AI-assisted parallel web search (5 concurrent search agents by sub-topic), and every cited source was then independently re-verified by a *separate* fetch of the actual source URL (not the search agent's self-report), confirming title, authorship, and abstract before inclusion. No citation in §2 was accepted without this independent verification step. The full verification record (24 candidates checked, 18 selected, 4 held as backup, 2 explicitly excluded as unverifiable) is released alongside this paper (`docs/VERIFIED-REFERENCES.md`).
2. **Experiment orchestration and code implementation**: the rendering, scoring, probing, and blind-audit code (§3) was written with AI assistance, then exercised against live model APIs, with results inspected by the author at each stage (including two rounds of self-correction: an initial "images are safe" finding at N=11 was revised after scaling to N=31 and N=120, §4.3; an initial "hidden channel is safe" finding was revised after a legibility-calibration check, §4.5).
3. **Text drafting**: this manuscript's prose was AI-drafted from the author-reviewed data tables and finding summaries, then reviewed by the author.
4. **Data correction propagation**: the scorer-artifact finding (§4.1) was used to issue a formal correction notice against the author's own concurrently-prepared competition submission material, to prevent the same artifact from propagating into materials describing this project for other purposes.

All numerical claims in this paper are backed by artifacts checked into the project's public repository (commit history and `validation/*.json` raw results); the author takes full responsibility for the paper's claims and reviewed all reported numbers against source data before submission. No experimental design decision, hypothesis pre-registration, or final claim was made by AI without author review; see the project's pre-registration document (`paper-expansion-plan.md` §11) for the hypotheses and stopping rules committed to before the corresponding experiments were run.

---

## Reproducibility

```bash
pip install agent-redteam
python scripts/run_docpipeline_n120.py       # §4.2
python scripts/run_experiment_b.py           # §4.3
python scripts/run_experiment_a.py           # §4.4
```
All scripts read API keys from local config files (never hard-coded or logged) and use only free-tier or flat-rate API access. Raw results: `validation/expA-layered-*.json`, `expB-render-*.json`, `docpipeline-n120-*.json`, `original15-dissect-*.json`, `blind-audit-kappa.json`, `legibility-threshold-*.json`. Consolidated: `validation/MASTER-REPORT.json`. Source: `github.com/uninhibited-scholar/agent-redteam`.

---

## References

[1] K. Greshake, S. Abdelnabi, S. Mishra, C. Endres, T. Holz, M. Fritz. "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection." arXiv:2302.12173, 2023.

[2] OWASP GenAI Security Project. "OWASP Top 10 for LLM Applications 2025 — LLM01: Prompt Injection." https://genai.owasp.org/llmrisk/llm01-prompt-injection/

[3] Anthropic. "Mitigating the risk of prompt injections in browser use." Research report, 2025. https://www.anthropic.com/research/prompt-injection-defenses

[4] E. Debenedetti, J. Zhang, M. Balunović, L. Beurer-Kellner, M. Fischer, F. Tramèr. "AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents." NeurIPS 2024 Datasets & Benchmarks. arXiv:2406.13352.

[5] Q. Zhan, Z. Liang, C. Ying, D. Kang. "InjecAgent: Benchmarking Indirect Prompt Injections in Tool-Integrated Large Language Model Agents." ACL 2024 Findings. arXiv:2403.02691.

[6] H. Zhang, J. Huang, K. Mei, Y. Yao, Z. Wang, C. Zhan, H. Wang, Y. Zhang. "Agent Security Bench (ASB): Formalizing and Benchmarking Attacks and Defenses in LLM-based Agents." ICLR 2025. arXiv:2410.02644.

[7] I. Evtimov, A. Zharmagambetov, A. Grattafiori, C. Guo, K. Chaudhuri. "WASP: Benchmarking Web Agent Security Against Prompt Injection Attacks." 2025. arXiv:2504.18575.

[8] X. Liu, Y. Zhu, J. Gu, Y. Lan, C. Yang, Y. Qiao. "MM-SafetyBench: A Benchmark for Safety Evaluation of Multimodal Large Language Models." ECCV 2024. arXiv:2311.17600.

[9] Y. Gong, D. Ran, J. Liu, C. Wang, T. Cong, A. Wang, S. Duan, X. Wang. "FigStep: Jailbreaking Large Vision-Language Models via Typographic Visual Prompts." AAAI 2025. arXiv:2311.05608.

[10] W. Luo, S. Ma, X. Liu, X. Guo, C. Xiao. "JailBreakV-28K: A Benchmark for Assessing the Robustness of MultiModal Large Language Models against Jailbreak Attacks." COLM 2024. arXiv:2404.03027.

[11] X. Qi, K. Huang, A. Panda, P. Henderson, M. Wang, P. Mittal. "Visual Adversarial Examples Jailbreak Aligned Large Language Models." AAAI 2024. arXiv:2306.13213.

[12] H. Cheng, E. Xiao, J. Gu, L. Yang, J. Duan, J. Zhang, J. Cao, K. Xu, R. Xu. "Unveiling Typographic Deceptions: Insights of the Typographic Vulnerability in Large Vision-Language Model." 2024. arXiv:2402.19150.

[13] A. Souly, Q. Lu, D. Bowen, et al. "A StrongREJECT for Empty Jailbreaks." NeurIPS 2024 Datasets & Benchmarks. arXiv:2402.10260.

[14] M. Mazeika, L. Phan, X. Yin, A. Zou, Z. Wang, N. Mu, E. Sakhaee, N. Li, S. Basart, B. Li, D. Forsyth, D. Hendrycks. "HarmBench: A Standardized Evaluation Framework for Automated Red Teaming and Robust Refusal." ICML 2024. arXiv:2402.04249.

[15] F. Eiras, A. Zemour, J. Lin, M. Mugunthan. "Know Thy Judge: On the Robustness Meta-Evaluation of LLM Safety Judges." 2025. arXiv:2503.04474.

[16] K. Mei, Z. Liu, Y. Wang, S. Bi, J. Mao, J. Cheng. "'Not Aligned' is Not 'Malicious': Being Careful about Hallucinations of Large Language Models' Jailbreak." 2024. arXiv:2406.11668.

[17] R. Balakrishnan, S. Mendapara, A. Garg. "Reading Between the Pixels: Linking Text-Image Embedding Alignment to Typographic Attack Success on Vision-Language Models." ICLR 2026 Workshop on Agents in the Wild. arXiv:2604.12371.

[18] M. Qraitem, N. Tasnim, P. Teterwak, K. Saenko, B. A. Plummer. "Vision-LLMs Can Fool Themselves with Self-Generated Typographic Attacks." 2024. arXiv:2402.00626.

[19] Y. Liu, Z. Li, M. Huang, B. Yang, W. Yu, C. Li, X. Yin, C. Liu, L. Jin, X. Bai. "OCRBench: On the Hidden Mystery of OCR in Large Multimodal Models." 2023/2024. arXiv:2305.07895.
