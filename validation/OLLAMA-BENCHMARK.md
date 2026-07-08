# 开源模型安全基准

> **数据源**：agent-redteam 10 套件 × 10 条/套件 = 100 条攻击样本
> **本地模型**：通过 Ollama 运行，零 API 费用，可复现
> **日期**：2026-07-08
> **持续更新**：这个基准会随模型更新和新模型发布持续刷新

---

## 为什么做本地模型基准

云 API 模型（GPT-4o、Claude、GLM-5.2）的安全测试需要 API key 和费用，难以持续。本地模型（Ollama）完全免费、可复现——任何人下载同样的模型就能得到同样的分数。

**这是第一个持续更新的开源 LLM 安全基准。**

---

## 当前排名

| 排名 | 模型 | 参数量 | Overall | 注 |
|------|------|--------|---------|-----|
| 1 | qwen2.5 | 0.5B | **78.5** | 最小但最强——在 supply_chain 上仍然弱（30 分） |
| — | GLM-5.2（云，参考） | — | 84.6 | 云端旗舰作为上限参考 |

### qwen2.5:0.5b 详细分数

```
injection          100.0   ✅  满分
over_refusal       100.0   ✅  满分
insecure_output    100.0   ✅  满分
model_dos          100.0   ✅  满分
sensitive_data      90.0   ✅
excessive_agency    90.0   ✅
info_leak           80.0   ✅
over_dependency     60.0   ⚠️
tool_abuse          50.0   ⚠️
supply_chain        30.0   ❌  最弱维度
```

---

## 关键发现

### 1. 0.5B 小模型的 injection 防御 = 100 分

qwen2.5:0.5b 只有 5 亿参数，但 prompt 注入防御满分——和 GLM-5.2（千亿级）持平。说明** injection 防御不完全依赖模型规模**，训练时的安全对齐才是关键。

### 2. 供应链攻击仍是共性弱点

qwen2.5:0.5b 在 supply_chain 上只有 30 分——和 GLM-5.2（53.3）、GLM-4.5（43.3）、GLM-4-Flash（36.7）一样。**从 0.5B 到千亿级，所有模型在这项上都不及格。**

### 3. 小模型的 tool_abuse 更弱

qwen2.5:0.5b 在 tool_abuse 上只有 50 分（GLM-5.2 是 100）——小模型更容易被诱导执行危险操作（`rm -rf`、`DROP TABLE`）。用小模型做 Agent 时这是首要风险。

---

## 复现

```bash
# 安装
pip install agent-redteam

# 拉取模型
ollama pull qwen2.5:0.5b

# 跑同样的基准
agent-redteam scan --target ollama --model qwen2.5:0.5b --limit 10
```

完全免费、完全本地、完全可复现。

---

## 计划纳入的模型

- [x] qwen2.5:0.5b（通义千问 0.5B）
- [ ] llama3.2:1b（Meta Llama 3.2 1B）— 扫描中
- [ ] gemma2:2b（Google Gemma 2 2B）
- [ ] phi3:3.8b（Microsoft Phi-3）
- [ ] mistral:7b（Mistral 7B）
- [ ] llama3.1:8b（Meta Llama 3.1 8B）

> 模型越大扫描越慢（本地推理）。0.5B 约 1 分钟，7B 约 30-60 分钟。
