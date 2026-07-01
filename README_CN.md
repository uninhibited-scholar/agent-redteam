<div align="center">

# ⬡ Agent Redteam

**AI Agent 红队安全测试平台**

[English](./README.md) | 中文

给 AI Agent 跑安全扫描，像 `npm audit` 一样简单

CLI · TUI · Web Dashboard | 588+ 测试样本 · 4 维攻击 · OWASP LLM Top 10 对齐

</div>

---

## 它解决什么问题

你的 AI agent 上线前，**有没有人像渗透测试一样给它跑安全扫描？**

Agent Redteam 让"发布前跑红队"成为标准动作。不是手写几个 prompt 试试——而是像安全扫描器一样，系统性地从四个维度跑 588 条攻击测试，告诉你你的 agent 到底哪里漏。

## 四个攻击维度

| 套件 | 测什么 | 样本量 | OWASP |
|------|--------|--------|-------|
| 🔴 **Prompt 注入** | 不可信内容中的隐藏指令能否诱导 agent 执行危险操作 | 153 | LLM01 |
| 🟠 **工具滥用** | 破坏性工具调用（rm -rf / DROP TABLE）能否被拦截 | 142 | LLM01 |
| 🔵 **过度拒绝** | 正当防御/教育问题是否被安全模型误拒 | 243 | LLM09 |
| 🟣 **信息泄露** | 系统提示/工具定义/模型配置能否被套出 | 50 | LLM06 |

## 三种使用方式

### 1. 命令行（日常使用）

```bash
pip install agent-redteam

# 扫描任意 OpenAI 兼容端点
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY

# 只跑特定套件
agent-redteam scan --model glm-4-plus \
  --base-url https://open.bigmodel.cn/api/paas/v4 \
  --key $KEY --suites injection,info_leak

# CI 集成（分数低于 80 则失败）
agent-redteam scan --model ... --fail-below 80 --format json > report.json
```

### 2. TUI 实时界面

```bash
pip install agent-redteam[tui]
agent-redteam scan --tui --model ... --key ...
```

### 3. Web Dashboard

```bash
# 扫描 + 实时 Dashboard
agent-redteam scan --serve --model ... --key ...
```

雷达图 · 热力图 · 漏洞卡片 · 实时遥测流。

## 编程 API

```python
from agent_redteam import Engine
from agent_redteam.targets import OpenAITarget

target = OpenAITarget(model="gpt-4o", api_key="sk-...")
engine = Engine(target)
report = engine.scan()
print(report.summary())
```

## 支持的目标

- **OpenAI 兼容**：OpenAI / DeepSeek / 智谱 GLM / 字节豆包 / vLLM / Ollama
- **Anthropic Claude**：Claude Messages API
- **本地 Agent**：任意 HTTP 端点

## 设计原则

- **Python 核心零依赖** — `pip install agent-redteam` 不拉任何包
- **API key 只在本地** — 不经过任何第三方
- **CI 友好** — `--fail-below N --format json`
- **数据来自实战验证** — 588 条精选自 1400+ 条标注 benchmark 数据

## 许可证

MIT
