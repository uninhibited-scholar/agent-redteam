# Verified References — Related Work Pool

**Method**: Diamond pattern — 5 parallel researchers fanned out by sub-topic, each returned candidates with a claimed URL. Every single candidate below was then **independently re-verified by the orchestrator** via a separate `WebFetch` of the actual URL (not by the researcher who found it) — confirming exact title, authors, and abstract match. No paper here was accepted on a researcher's say-so alone. Two candidates were flagged as uncertain by their researcher and are excluded (not listed below).

24/24 fetched candidates verified as real. Selected ~18 below for the paper; the rest are backup/optional.

---

## A. Foundational prompt injection & industry framing
1. **Greshake, Abdelnabi, Mishra, Endres, Holz, Fritz** — "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection" (2023). https://arxiv.org/abs/2302.12173 — origin paper for indirect prompt injection; founding threat model.
2. **OWASP GenAI Security Project** — "OWASP Top 10 for LLM Applications 2025 — LLM01: Prompt Injection". https://genai.owasp.org/llmrisk/llm01-prompt-injection/ — industry-standard framing of injection as the #1 systemic risk.
3. **Anthropic** — "Mitigating the risk of prompt injections in browser use" (research report, Nov 2025). https://www.anthropic.com/research/prompt-injection-defenses — real-world browser-agent ASR data (~1% under adaptive attack), motivates cross-surface framing.

## B. Text-channel agent injection benchmarks (baseline to contrast against vision channel)
4. **Debenedetti, Zhang, Balunović, Beurer-Kellner, Fischer, Tramèr** — "AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents" (NeurIPS 2024 D&B). https://arxiv.org/abs/2406.13352
5. **Zhan, Liang, Ying, Kang** — "InjecAgent: Benchmarking Indirect Prompt Injections in Tool-Integrated LLM Agents" (ACL 2024 Findings). https://arxiv.org/abs/2403.02691
6. **Zhang, Huang, Mei, Yao, Wang, Zhan, Wang, Zhang** — "Agent Security Bench (ASB): Formalizing and Benchmarking Attacks and Defenses in LLM-based Agents" (ICLR 2025). https://arxiv.org/abs/2410.02644
7. **Evtimov, Zharmagambetov, Grattafiori, Guo, Chaudhuri** — "WASP: Benchmarking Web Agent Security Against Prompt Injection Attacks" (2025). https://arxiv.org/abs/2504.18575 — notes attacks often *partially* succeed (up to 86%) but rarely fully complete attacker goals — directly supports a "single ASR number hides partial-vs-complete compromise" argument.

## C. Vision-channel jailbreak / multimodal safety benchmarks
8. **Liu, Zhu, Gu, Lan, Yang, Qiao** — "MM-SafetyBench: A Benchmark for Safety Evaluation of Multimodal LLMs" (ECCV 2024). https://arxiv.org/abs/2311.17600 — the canonical "multimodal blind spot" benchmark our re-measurement directly engages with.
9. **Gong, Ran, Liu, Wang, Cong, Wang, Duan, Wang** — "FigStep: Jailbreaking Large Vision-Language Models via Typographic Visual Prompts" (AAAI 2025). https://arxiv.org/abs/2311.05608 — 82.5% ASR via typographic images; a channel-specific (not generalizable) result.
10. **Luo, Ma, Liu, Guo, Xiao** — "JailBreakV-28K: A Benchmark for Assessing the Robustness of MLLMs against Jailbreak Attacks" (COLM 2024). https://arxiv.org/abs/2404.03027 — finds text-transferred attacks often dominate over pure image attacks — supports our "multimodal vulnerability conflates channels" claim directly.
11. **Qi, Huang, Panda, Henderson, Wang, Mittal** — "Visual Adversarial Examples Jailbreak Aligned Large Language Models" (AAAI 2024). https://arxiv.org/abs/2306.13213
12. **Cheng, Xiao, Gu, Yang, Duan, Zhang, Cao, Xu, Xu** — "Unveiling Typographic Deceptions: Insights of the Typographic Vulnerability in LVLMs" (2024). https://arxiv.org/abs/2402.19150 — shows prompting reduces degradation from 42.07%→13.90%, supporting "vulnerability is measurement/setup-sensitive."

## D. Evaluator/judge validity & ASR measurement critiques (directly backs our A/B/C + κ methodology)
13. **Souly, Lu, Bowen, Trinh, Hsieh, Pandey, Abbeel, Svegliato, Emmons, Watkins, Toyer** — "A StrongREJECT for Empty Jailbreaks" (NeurIPS 2024 D&B). https://arxiv.org/abs/2402.10260 — shows automated evaluators overstate success by conflating willingness-to-respond with actual harm; closest existing analogue to our "described ≠ executed" distinction.
14. **Mazeika, Phan, Yin, Zou, Wang, Mu, Sakhaee, Li, Basart, Li, Forsyth, Hendrycks** — "HarmBench: A Standardized Evaluation Framework for Automated Red Teaming and Robust Refusal" (ICML 2024). https://arxiv.org/abs/2402.04249 — the canonical single-ASR benchmark our critique is positioned against.
15. **Eiras, Zemour, Lin, Mugunthan** — "Know Thy Judge: On the Robustness Meta-Evaluation of LLM Safety Judges" (2025). https://arxiv.org/html/2503.04474v1 — stylistic changes alone shift judge FN rate by up to 0.24 — directly motivates our independent-judge blind audit (κ).
16. **Mei, Liu, Wang, Bi, Mao, Cheng** — "'Not Aligned' is Not 'Malicious': Being Careful about Hallucinations of LLMs' Jailbreak" (2024). https://arxiv.org/abs/2406.11668 — documents evaluator false-positive hallucination in jailbreak scoring, closely analogous to our scorer-inflation finding (Exp0).

## E. VLM perception of embedded/overlay text (backs our legibility-threshold + A/B/C-perception findings)
17. **Balakrishnan, Mendapara, Garg** — "Reading Between the Pixels: Linking Text-Image Embedding Alignment to Typographic Attack Success on VLMs" (ICLR 2026 Workshop). https://arxiv.org/abs/2604.12371 — attack success gated by a measurable alignment/legibility signal; visual degradation reduces success 34–96% — closely parallels our calibrated gray-threshold finding.
18. **Qraitem, Tasnim, Teterwak, Saenko, Plummer** — "Vision-LLMs Can Fool Themselves with Self-Generated Typographic Attacks" (2024). https://arxiv.org/abs/2402.00626
19. **Liu, Li, Huang, Yang, Yu, Li, Yin, Liu, Jin, Bai** — "OCRBench: On the Hidden Mystery of OCR in Large Multimodal Models" (2023/2024). https://arxiv.org/abs/2305.07895 — baseline for how reliably VLMs read embedded text at all.

---

## Backup / optional (verified but not selected for the main 18)
- Westerhoff et al., "SCAM: A Real-World Typographic Robustness Evaluation for Multimodal Foundation Models" (CVPR 2025 Workshop). https://arxiv.org/abs/2504.04893
- Maple, Kumar, Tapwal, "Single-Configuration Attack Success Rate Is Not Enough" (2026). https://arxiv.org/pdf/2605.09070
- Monteuuis, Chen, Petit, "The Great Pretender: A Stochasticity Problem in LLM Jailbreak" (2026). https://arxiv.org/html/2605.14418 — judge temperature alone shifts ASR by up to 54pp; strong supporting evidence for judge-validity concerns, held as backup due to very recent/unreviewed status.
- Wang, Zhang, "Kill-Chain Canaries: Stage-Level Tracking of Prompt Injection..." (2026). https://arxiv.org/abs/2603.28013 — very recent preprint, cryptographic-canary methodology parallels our transcription-proof canary design; held as backup pending peer-review status.

## Excluded (researcher flagged as unverifiable, not fabricated, correctly omitted)
- An unnamed "Goh et al." typographic-attack paper (vision-channel researcher could not confirm existence — flagged rather than guessed).
- A hypothesized paper combining "canary-based judge" + text-vs-vision comparison as a named benchmark (text-channel researcher explicitly noted this may be a genuine gap / novel contribution rather than a missing citation).
