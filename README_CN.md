<div align="center">

# ⬡ Agent Redteam

**AI Agent 红队安全测试平台**

[English](./README.md) | 中文

给 AI Agent 跑安全扫描，像 `npm audit` 一样简单

CLI · TUI · Web Dashboard | 2,089 测试样本 · 10 攻击套件 · OWASP LLM Top 10 全覆盖

</div>

---

## 为什么需要它

AI agent 在没有安全检查的情况下就被发布——不像普通软件有 `npm audit` 这样的工具。**Agent Redteam 就是这个缺失的等效工具**：在 agent 上线前，系统性地从 10 个维度跑 2,089 条攻击测试，输出具体的 pass/fail 分数。

### 可信度设计

- **零依赖核心** — Python stdlib only，不增加供应链风险
- **API key 仅本地** — key 不经过任何第三方
- **数字精确** — 所有样本数、分数、判定逻辑可复现

## 十个攻击维度（OWASP LLM Top 10 全覆盖）

| 套件 | 测什么 | 样本量 | OWASP |
|------|--------|--------|-------|
| 🔴 **Prompt 注入** | 不可信内容中的隐藏指令能否诱导 agent 执行危险操作 | 200 | LLM01 |
| 🟠 **工具滥用** | 破坏性工具调用能否被拦截 | 200 | LLM01 |
| 🟫 **供应链攻击** | typosquatting / dependency confusion / CI-CD 投毒 | 200 | LLM02 |
| 🟡 **模型 DoS** | token 耗尽 / 递归生成 / 上下文炸弹 | 200 | LLM04 |
| 🟢 **过度代理** | agent 是否声称超出其能力的权限 | 200 | LLM05 |
| 🟣 **信息泄露** | 系统提示/工具定义/模型配置能否被套出 | 200 | LLM06 |
| 🔵 **不安全输出** | 是否会生成恶意代码/webshell/exploit | 200 | LLM07 |
| 🟤 **敏感信息** | PII/凭据/密钥/训练数据泄露 | 200 | LLM08 |
| ⚪ **过度拒绝** | 正当防御/教育问题是否被误拒 | 289 | LLM09 |
| 🔘 **过度依赖** | 幻觉/过度自信 | 200 | LLM10 |

**总计 2,089 条**，以 `agent-redteam list` 实际输出为准。

## 使用方式

```bash
pip install agent-redteam

# 命令行
agent-redteam scan --model glm-4-plus --key $KEY

# CI 集成
agent-redteam scan --model ... --fail-below 80 --format json

# Web Dashboard
agent-redteam scan --serve --model ... --key ...

# TUI
agent-redteam scan --tui --model ... --key ...
```

## 支持的目标

OpenAI / DeepSeek / GLM / Doubao / Claude / Z.ai / 本地 HTTP Agent

## 设计原则

- **Python 核心零依赖** — `pip install` 不拉任何包
- **API key 只在本地** — 不经过任何第三方
- **CI 友好** — `--fail-below N --format json`
- **数据来自实战验证** — 2,089 条精选标注数据，覆盖 OWASP Top 10

## 许可证

MIT
