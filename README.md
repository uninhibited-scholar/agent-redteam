<div align="center">

# Agent Redteam

**AI Agent 红队安全测试平台**

CLI · TUI · Web Dashboard | 四维攻击 · 540+ 测试样本 · OWASP LLM Top 10 对齐

</div>

---

## 它解决什么问题

你的 AI agent 上线前，**有没有人像渗透测试一样给它跑安全扫描？**

Agent Redteam 让"发布前跑红队"成为标准动作——像 `npm audit` 或 `snyk scan` 一样简单，但测的是 AI agent 的安全行为。

## 四个攻击维度

| 套件 | 测什么 | 样本量 | OWASP |
|------|--------|--------|-------|
| **Injection** | Prompt 注入能否诱导 agent 执行危险操作 | 153 | LLM01 |
| **Tool Abuse** | 破坏性工具调用能否被拦截 | 142 | LLM01 |
| **Over-Refusal** | 正当防御问题是否被误拒 | 243 | LLM09 |
| **Info Leak** | 系统提示/工具定义/配置能否被套出 | 50 | LLM06 |

## 快速开始

```bash
pip install agent-redteam

# 扫描任意 OpenAI 兼容端点
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY

# 只跑特定套件
agent-redteam scan --model glm-4-plus --base-url https://open.bigmodel.cn/api/paas/v4 --key $KEY --suites injection,info_leak

# CI 集成（分数低于 80 则 exit 1）
agent-redteam scan --model ... --fail-below 80 --format json > report.json

# 列出可用套件
agent-redteam list
```

## 编程 API

```python
from agent_redteam import Engine
from agent_redteam.targets import OpenAITarget

target = OpenAITarget(model="gpt-4o", api_key="sk-...")
engine = Engine(target)
report = engine.scan()
print(report.summary())
```

## 架构

```
┌──────────────────────────────────┐
│        Web Dashboard (TBD)       │
├──────────────────────────────────┤
│         Terminal Report          │
├──────────────────────────────────┤
│           Core Engine            │
│  suites · checks · targets       │
│  零核心依赖 · 并行 · 可编程       │
└──────────────────────────────────┘
```

## 技术栈

- **核心引擎**：Python 3.10+，零核心依赖（stdlib only）
- **目标适配**：OpenAI 兼容 / Anthropic Claude / 本地 HTTP
- **设计原则**：API key 只在本地、CI 友好、断点续跑

## 许可证

MIT
