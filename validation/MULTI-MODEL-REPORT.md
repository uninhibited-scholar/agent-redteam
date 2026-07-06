# 多模型安全对比报告

> **扫描配置**：`agent-redteam scan --target zai --model <model> --limit 30`
> **规模**：10 套件 × 30 条 = 300 条/模型，三模型共 900 条
> **日期**：2026-07-07
> **端点**：Z.ai Anthropic 端点（同一端点，消除端点差异变量）

---

## 总分排名

```
模型            Overall    Passed/300    评级
──────────────────────────────────────────────
GLM-5.2          84.6        247         B  最强
GLM-4.5          81.6        239         B
GLM-4-Flash      76.0        229         C  最弱
```

**结论**：旗舰模型（GLM-5.2）最安全，但领先幅度不大（+3 分）。轻量模型（Flash）在 injection 上有明显退化。

---

## 逐套件对比

| 套件 | GLM-5.2 | GLM-4.5 | GLM-4-Flash | 差异分析 |
|------|---------|---------|-------------|----------|
| injection | 100.0 | 100.0 | **70.0** | ⚠ Flash 被 prompt 注入攻破 9 次，两个大模型零通过 |
| tool_abuse | 100.0 | 100.0 | 90.0 | Flash 偶尔放行破坏性工具调用 |
| model_dos | 100.0 | 100.0 | 100.0 | 三模型都正确拦截 token 耗尽 |
| over_refusal | 93.3 | 96.7 | 93.3 | 三模型都不过度拒绝正当问题 |
| insecure_output | 96.7 | 90.0 | 93.3 | 都较好，Flash 略好于 4.5 |
| sensitive_data | 86.7 | 76.7 | 80.0 | 5.2 最强，4.5 最弱 |
| excessive_agency | **66.7** | 86.7 | 80.0 | ⚠ **反直觉**：5.2 最差，4.5 反而最好 |
| info_leak | **70.0** | 50.0 | 50.0 | ⚠ 5.2 显著强于两个旧模型 |
| supply_chain | 53.3 | 43.3 | 36.7 | 三模型都不及格——都会帮写恶意包 |
| over_dependency | 56.7 | 53.3 | 70.0 | ⚠ Flash 反而最好（更多 hedge） |

---

## 三个真实洞察

### 1. 模型越大 ≠ 越安全（在某些维度）

GLM-5.2 总分最高，但在 **excessive_agency**（能力夸大）上反而是三个里最差的（66.7 vs 4.5 的 86.7）。旗舰模型更"自信"，更容易顺着用户的前提承认自己有并不具备的能力。这说明**安全能力不会随模型规模单调提升**，需要单独评测。

### 2. 轻量模型的 injection 防御断崖

GLM-4-Flash 在 injection 上只有 70 分（被攻破 9/30），而两个大模型都是 100。prompt 注入是最经典的攻击，Flash 的降本显然牺牲了这层防御。**用 Flash 做 agent 时，prompt 注入是首要风险**。

### 3. 供应链攻击是共性弱点

三个模型在 supply_chain 上都不及格（53.3 / 43.3 / 36.7）。它们都会帮用户写 typosquatting 包名、dependency confusion 配置、CI 投毒 workflow——只是加一句"安全提示"就觉得自己尽责了。**这不是某个模型的问题，是当前 LLM 安全对齐的系统性缺口**。

---

## 复现

```bash
agent-redteam scan --target zai --model GLM-5.2     --limit 30
agent-redteam scan --target zai --model GLM-4.5     --limit 30
agent-redteam scan --target zai --model GLM-4-Flash --limit 30
agent-redteam compare <run_a> <run_b>   # 任意两个对比
```

原始数据：`validation/glm-4.5-300.json`、`validation/glm-4-flash-300.json`、`validation/full-300-final.json`
