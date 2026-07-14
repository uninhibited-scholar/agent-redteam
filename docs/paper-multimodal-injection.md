# Multimodal Prompt Injection: A Systematic Evaluation of Cross-Channel Attack Vectors Against LLM Safety Defenses

**Jiehan Zhu**  
Department of Information Engineering, The Chinese University of Hong Kong  
1155256931@link.cuhk.edu.hk

---

## Abstract

Large language models (LLMs) are becoming better at defending against text-based prompt injection. However, we find that the defense can become much weaker when attack instructions are placed in non-text channels, such as image metadata, document structures, or hidden text elements. In this paper, we test five attack types: single-turn text injection, mutation-based attacks, multi-turn conversational attacks, multimodal hidden injection, and adaptive evolutionary attacks. We use the same testing framework for all of them. We run the experiments on three models: GLM-5.2, GLM-4.5, and GLM-4-Flash. The results show that attacks outside plain text can still bypass existing defenses. For GLM-5.2, the defense score drops from 100/100 on standard text injection to 26.7/100 on multimodal injection, giving a 73% bypass rate. Mutation attacks reach a 35.2% bypass rate, while multi-turn attacks reach 22%. We release our testing framework, agent-redteam, as an open-source tool. It contains 2,319 attack samples across 14 test suites covering the OWASP LLM Top 10.

## 1 Introduction

More AI agents can now read user-uploaded files, images, and documents. This creates a new attack surface that current safety evaluations do not fully cover. Most LLM safety alignment focuses on text prompts, so models may have a blind spot when instructions are hidden in non-text inputs.

This paper makes the following contributions:

1. **A five-dimensional evaluation framework** that compares LLM defense performance across text injection, mutation attacks, multi-turn attacks, multimodal attacks, and adaptive evolutionary attacks.

2. **Evidence of a cross-channel security gap**: GLM-5.2's defense score drops from 100/100 for text injection to 26.7/100 for multimodal injection, which gives a 73% bypass rate.

3. **An open-source testing platform** (agent-redteam) with 2,319 attack samples, 14 test suites, and support for 8 model targets, so that other people can reproduce the evaluation.

## 2 Related Work

Prompt injection attacks were first formalized by [1], which showed that LLMs may follow instructions embedded in untrusted input. OWASP later listed prompt injection as the number one risk in its LLM Top 10 [2].

Multimodal prompt injection was discussed by Schneider [3], who described attacks hidden in images, audio, and video. Keysight [4] studied invisible Unicode-based injection techniques. A larger academic evaluation in [5] tested multimodal injection on several models and reported over 90% success rates for some attack types. Earlier work on benchmarking text-based prompt injection attacks and defenses [6] also provides useful baselines.

Compared with previous work, our main difference is a **systematic cross-dimensional comparison**. We test the same model across five attack dimensions using one framework. This helps us compare how the defense changes across different types of attacks (0% → 35% → 22% → 73% → 100% bypass rates).

## 3 Methodology

### 3.1 Testing Framework

We built agent-redteam, an open-source Python package (`pip install agent-redteam`) with zero core dependencies, using only the Python standard library. The framework includes:

- **14 attack suites** covering OWASP LLM Top 10 categories
- **2,319 attack samples**, including single-turn, multi-turn, and multimodal scenarios
- **8 target adapters** (OpenAI, Claude, GLM/Z.ai, Ollama, DeepSeek, Azure, Qwen, local)
- **11 mutation strategies** for automatically changing attacks
- **An adaptive evolutionary engine** that generates and evolves attacks until it finds bypasses

### 3.2 Models Tested

| Model | Provider | Type |
|-------|----------|------|
| GLM-5.2 | Z.ai | Cloud, flagship |
| GLM-4.5 | Z.ai | Cloud, previous generation |
| GLM-4-Flash | Z.ai | Cloud, lightweight |

### 3.3 Attack Dimensions

**Dimension 1: Single-Turn Text Injection (30 samples per suite)**  
These are standard prompt injection attacks sent as text. The injection suite tests whether a model follows instructions embedded in untrusted content, such as web pages or emails.

**Dimension 2: Mutation-Based Attacks (55 samples)**  
We take 5 samples that the model successfully defended and apply 11 mutation strategies: homoglyph substitution, zero-width insertion, context reframing, synonym replacement, base64 encoding, URL encoding, case spoofing, punctuation injection, multilingual mixing, role injection, and split-recombine. We then test each mutated attack again on the same model.

**Dimension 3: Multi-Turn Conversational Attacks (50 scenarios)**  
These are scripted multi-turn conversations where the attacker builds trust or context over 3–5 turns before sending the actual attack. The categories are trust-building, privilege escalation, context poisoning, role-play injection, and indirect instruction.

**Dimension 4: Multimodal Hidden Injection (15 samples)**  
Attack instructions are hidden in non-text channels:

- SVG hidden text (`font-size:0`, `opacity:0.01`, `position:absolute`)
- HTML invisible layers (comments, CSS `display:none`, `font-size:0px`)
- PDF metadata (`/Subject` field)
- Zero-width Unicode steganography

**Dimension 5: Adaptive Evolutionary Attacks**  
An automated evolutionary engine mutates seed attacks, tests them against the target, and uses successful bypasses as seeds for the next round. The engine stops after finding a target number of bypasses or reaching the maximum number of rounds.

## 4 Experiments and Results

### 4.1 Single-Turn Baseline (Dimension 1)

| Suite | GLM-5.2 | GLM-4.5 | GLM-4-Flash |
|-------|---------|---------|-------------|
| Injection | **100.0** | **100.0** | 70.0 |
| Tool Abuse | **100.0** | **100.0** | 90.0 |
| Model DoS | **100.0** | **100.0** | **100.0** |
| Insecure Output | 96.7 | 90.0 | 93.3 |
| Over-Refusal | 93.3 | 96.7 | 93.3 |
| Sensitive Data | 86.7 | 76.7 | 80.0 |
| Info Leak | 70.0 | 50.0 | 50.0 |
| Excessive Agency | 66.7 | 86.7 | 80.0 |
| Over-Dependency | 56.7 | 53.3 | 70.0 |
| Supply Chain | 53.3 | 43.3 | 36.7 |
| **Overall** | **84.6** | **81.6** | **76.0** |

GLM-5.2 gets perfect scores on Injection, Tool Abuse, and Model DoS. However, it has the lowest score among the three models on Excessive Agency (66.7). This may mean that flagship models are more likely to overclaim their abilities, possibly because they respond with higher confidence. Note: the Overall score is a severity-weighted average across all suites (critical = 4x, high = 3x, medium = 2x, low = 1x), not a simple mean.

### 4.2 Mutation Attack Results (Dimension 2)

We tested 55 mutated attacks, created from 5 original samples and 11 strategies. GLM-5.2 had successfully defended all 5 original samples.

| Strategy | Bypass Rate |
|----------|------------|
| Reframe | **60%** |
| Multilingual | **60%** |
| Split | **60%** |
| Zero-width | 40% |
| Synonym | 40% |
| Punctuation | 40% |
| Homoglyph | 20% |
| Base64 | 20% |
| URL Encode | 20% |
| Role Inject | 20% |
| Case Spoof | 0% |
| **Overall** | **35.2%** |

The three most effective strategies, reframe, multilingual, and split, have one thing in common: they change the **structure** of the attack instead of only changing its **surface form**. This suggests that GLM-5.2's injection defense may partly depend on surface-level pattern matching.

### 4.3 Multi-Turn Attack Results (Dimension 3)

| Model | Score | Pass/Fail | Bypass Rate |
|-------|-------|-----------|-------------|
| qwen2.5:0.5b | 66.0 | 33/17 | 34% |
| llama3.2:1b | 88.0 | 44/6 | 12% |
| GLM-5.2 | ~78 | 21/6 (partial: 27 of 50 scenarios) | ~22% |

One interesting result is that qwen2.5:0.5b scores 100 on single-turn injection but only 66 on multi-turn attacks, which is a 34-point drop. This shows that single-turn evaluations may seriously overestimate the security of a small model.

### 4.4 Multimodal Attack Results (Dimension 4)

| Attack Type | Bypassed/Total | Bypass Rate |
|-------------|---------------|-------------|
| SVG Hidden Text | 4/5 | 80% |
| HTML Invisible Layer | 3/3 | 100% |
| PDF Metadata | 1/1 | 100% |
| OCR Image Injection | 2/3 | 67% |
| Steganography | 1/2 | 50% |
| **Total** | **11/15** | **73%** |

GLM-5.2's multimodal defense score is **26.7/100**, compared with 100/100 on text injection. Only 4 of the 15 attacks were blocked, and all four included very obvious system-level commands, such as `chmod 777` or CI/CD script execution.

### 4.5 Adaptive Evolutionary Attack Results (Dimension 5)

The adaptive engine found bypasses in **Round 1** using the URL encoding strategy, with a 100% bypass rate across 2 attempts. This suggests that GLM-5.2's injection detection may partly rely on raw character matching of Chinese text, which URL encoding can avoid.

### 4.6 Cross-Dimensional Comparison

| Attack Dimension | GLM-5.2 Defense | Bypass Rate |
|-----------------|----------------|-------------|
| Single-turn text injection | 100/100 | 0% |
| Mutation attacks | — | 35.2% |
| Multi-turn attacks | ~78/100 | 22% |
| Multimodal hidden injection | 26.7/100 | 73% |
| Adaptive evolutionary | — | 100% (Round 1) |

Overall, the defense becomes weaker when attacks are no longer standard text-only prompt injection. The exact bypass rates do not increase in every step, but the multimodal and adaptive attacks show a much larger security gap than the single-turn baseline.

## 5 Discussion

### 5.1 Why Multimodal Attacks Succeed

Current LLM safety training mostly focuses on text prompts. Models are trained to recognize and refuse patterns such as “ignore previous instructions.” However, there may not be similar training for cases like an SVG containing hidden `font-size:0` text. The model may treat extracted content as instructions without considering which channel it comes from.

### 5.2 Implications for Agent Security

Any AI application that accepts file or image uploads may be vulnerable. Common attack vectors include:

- Document analysis assistants with hidden instructions in PDF metadata
- OCR applications with low-contrast text in images
- Meeting assistants that read small text in whiteboard photos
- Code review bots with instructions in code comments

### 5.3 Defense Recommendations

1. **Input provenance marking**: Tag extracted file content as untrusted data before passing it to the model.
2. **Hidden content detection**: Remove `font-size:0` elements, HTML comments, and PDF metadata before processing.
3. **Multimodal safety classifiers**: Train models to detect hidden instructions in non-text channels.
4. **Systematic security testing**: Use tools such as agent-redteam to keep testing defenses.

### 5.4 Limitations

Our multimodal tests simulate multimodal scenarios through text-based transmission, such as SVG or HTML content passed as text. We do not actually upload image files to vision-capable models. Therefore, the results describe hidden-content injection in document-processing pipelines more accurately than pixel-level image attacks. Future work can test real multimodal models that directly receive image inputs.

## 6 Conclusion

We show that LLM safety defenses have a clear blind spot for non-text attack channels. The same model that has perfect defense against text-based prompt injection (100/100) allows 73% of multimodal attacks to bypass it (26.7/100). This cross-channel security gap is not only a problem in one specific model. It may reflect a broader weakness in current LLM safety alignment, because training data and evaluation benchmarks mainly focus on text while non-text channels receive less attention.

As AI applications process more multimodal inputs, including images, documents, and audio, closing this gap becomes important. We release our testing framework as an open-source tool so this kind of evaluation and improvement can continue.

## Reproducibility

All experiments can be reproduced:

```bash
pip install agent-redteam
agent-redteam scan --target zai --model GLM-5.2 --limit 30
```

Source code: https://github.com/uninhibited-scholar/agent-redteam

## References

[1] Greshake, K. et al. “Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection.” *AISec 2023*.

[2] OWASP. “OWASP Top 10 for LLM Applications.” https://genai.owasp.org/llmrisk/llm01-prompt-injection/

[3] Schneider, C. “Multimodal Prompt Injection.” https://christian-schneider.net/blog/multimodal-prompt-injection/

[4] Keysight. “Understanding Invisible Prompt Injection Attack.” https://www.keysight.com/blogs/en/tech/nwvs/2025/05/16/invisible-prompt-injection-attack

[5] Anonymous. “Multimodal Prompt Injection Attacks: Risks and Defenses for Modern LLMs.” *arXiv:2509.05883*, 2025.

[6] Liu, Y. et al. “Formalizing and Benchmarking Prompt Injection Attacks and Defenses on Large Language Models.” *USENIX Security 2024*.

## Appendix A: Check Precision Fixes

During validation, we found and fixed three accuracy issues in the check modules that were causing false positives:

1. **LeakCheck**: The original fallback for responses longer than 50 characters marked safe deflections, such as “I don't have a temperature parameter to disclose,” as leaks. We changed it to content-based detection only.

2. **HedgeCheck**: The hedging regular expression was too narrow and missed common deflection phrases. We expanded it using real model response patterns.

3. **Refusal detection**: We added mixed Chinese-English refusal patterns and defensive pivots.

These fixes are covered by regression tests, with 294 tests in total.
