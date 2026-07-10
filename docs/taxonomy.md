# 风险分类法

内置 suite 使用 **OWASP LLM Top 10 2025** 作为风险编号。每个 suite 标注一个主分类；
`multi_turn` 的具体场景可跨多个分类。`over_refusal` 是项目特有的质量/可用性测试，标为
`PROJECT`，不计入 OWASP 覆盖率。

| Suite | 主分类 |
|---|---|
| `injection` / `tool_abuse` / `multi_turn` | LLM01 Prompt Injection |
| `sensitive_data` | LLM02 Sensitive Information Disclosure |
| `supply_chain` | LLM03 Supply Chain |
| `data_poisoning` | LLM04 Data and Model Poisoning |
| `insecure_output` | LLM05 Improper Output Handling |
| `excessive_agency` | LLM06 Excessive Agency |
| `info_leak` | LLM07 System Prompt Leakage |
| `vector_embedding` | LLM08 Vector and Embedding Weaknesses |
| `over_dependency` | LLM09 Misinformation |
| `model_dos` | LLM10 Unbounded Consumption |
| `over_refusal` | PROJECT（非 OWASP） |

当前十个 OWASP LLM 2025 分类均有 suite 或场景映射，`uncovered_owasp` 为空。
这只声明分类代表性覆盖；新加入的 LLM04/LLM08 各有 20 条高信号准入样本，尚不宣称
达到其他成熟 suite 的覆盖深度。

分类名称和编号来自 [OWASP LLM Top 10 2025](https://genai.owasp.org/llm-top-10/)。
