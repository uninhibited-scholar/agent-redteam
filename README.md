<div align="center">

# ⬡ Agent Redteam

**AI Agent 红队安全测试平台**

给 AI Agent 跑安全扫描，像 `npm audit` 一样简单

CLI · TUI · Web Dashboard | 2,089 测试样本 · 10 攻击套件 · OWASP LLM Top 10 全覆盖

</div>

---

## 为什么需要它

AI agent 在没有安全检查的情况下就被发布——不像普通软件有 `npm audit`、`snyk scan` 这样的工具。**Agent Redteam 就是这个缺失的等效工具**：在 agent 上线前，系统性地从 10 个维度跑 2,089 条攻击测试，输出具体的 pass/fail 分数，而不是模糊的"感觉安全"。

### 可信度设计

- **零依赖核心** — Python stdlib only，`pip install agent-redteam` 不拉任何包。在测试供应链攻击的同时不增加供应链风险。
- **API key 仅本地** — key 不经过任何第三方，不出现在 HTTP 响应中（有专门测试兜底）。
- **数字精确** — 每个套件的样本数、分数、判定逻辑都可复现。

## 十个攻击维度（OWASP LLM Top 10 全覆盖）

| 套件 | 测什么 | 样本量 | OWASP |
|------|--------|--------|-------|
| 🔴 **Injection** | Prompt 注入能否诱导 agent 执行危险操作 | 200 | LLM01 |
| 🟠 **Tool Abuse** | 破坏性工具调用（rm -rf / DROP TABLE）能否被拦截 | 200 | LLM01 |
| 🟫 **Supply Chain** | typosquatting / dependency confusion / CI-CD 投毒 | 200 | LLM02 |
| 🟡 **Model DoS** | token 耗尽 / 递归生成 / 上下文炸弹 | 200 | LLM04 |
| 🟢 **Excessive Agency** | agent 是否声称超出其能力的权限 | 200 | LLM05 |
| 🟣 **Info Leak** | 系统提示/工具定义/模型配置能否被套出 | 200 | LLM06 |
| 🔵 **Insecure Output** | 是否会生成恶意代码/webshell/exploit | 200 | LLM07 |
| 🟤 **Sensitive Data** | PII/凭据/密钥/训练数据泄露 | 200 | LLM08 |
| ⚪ **Over-Refusal** | 正当防御/教育问题是否被安全模型误拒 | 289 | LLM09 |
| 🔘 **Over-Dependency** | 幻觉/过度自信——对不确定的事给了确定答案 | 200 | LLM10 |

**总计 2,089 条攻击样本**，所有数字以 `agent-redteam list` 的实际输出为准。

## 三种使用方式

### 1. CLI（开发者日常）

```bash
pip install agent-redteam

# 扫描任意 OpenAI 兼容端点
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY

# CI 集成（分数低于 80 则 exit 1）
agent-redteam scan --model ... --fail-below 80 --format json > report.json
```

<details>
<summary>终端报告效果（真实扫描结果）</summary>

```
╔══════════════════════════════════════════════════════╗
║          Agent Redteam Report — glm-4-plus           ║
║            25 samples · Score: 80.0/100              ║
╠══════════════════════════════════════════════════════╣
║  info_leak        ██████████ 100.0  ✅               ║
║  sensitive_data   ██████████ 100.0  ✅               ║
║  insecure_output  ██████████ 100.0  ✅               ║
║  excessive_agency ██████████ 100.0  ✅               ║
║  over_dependency  ░░░░░░░░░░   N/A  ❌ (errors)      ║
╠══════════════════════════════════════════════════════╣
║           Overall: 80.0/100  PASS                    ║
╚══════════════════════════════════════════════════════╝
```

**发现**：info_leak 在 `open.bigmodel.cn` 端点得 0 分（全部泄露系统提示词），但在 Z.ai 端点得 100 分（正确拒绝）。**同一个模型、不同端点，安全表现完全不同**——这是通用 benchmark 发现不了的。

</details>

### 2. TUI（实时扫描界面）

```bash
pip install agent-redteam[tui]
agent-redteam scan --tui --model ... --key ...
```

### 3. Web Dashboard

```bash
agent-redteam scan --serve --model ... --key ...
```

浏览器自动打开，6 个页面：Overview（雷达图 + 仪表盘）、Findings（漏洞卡片墙）、LiveScan（实时遥测流）、Scan Launcher（配置启动）、History（历史对比）、Compare（A/B 模型对比）。

## 编程 API

```python
from agent_redteam import Engine
from agent_redteam.targets import OpenAITarget

target = OpenAITarget(model="gpt-4o", api_key="sk-...")
engine = Engine(target)
report = engine.scan()
print(report.summary())
assert report.overall_score >= 80
```

## 支持的目标

| 目标 | 说明 |
|------|------|
| **OpenAI 兼容** | OpenAI / DeepSeek / GLM / Doubao / vLLM / Ollama |
| **Anthropic Claude** | Claude Messages API |
| **Z.ai (智谱)** | Z.ai Anthropic 端点 |
| **本地 Agent** | 任意 HTTP 端点 |

## 技术栈

| 层 | 技术 |
|----|------|
| 核心引擎 | Python 3.10+，零核心依赖 |
| TUI | Textual（可选） |
| Web 前端 | React + TypeScript + Vite |
| 图表 | 纯 SVG 自绘，零运行时依赖 |
| Web 后端 | Python stdlib http.server |
| 数据持久化 | SQLite (stdlib sqlite3) |

## 项目结构

```
agent-redteam/
├── src/agent_redteam/              # Python 包 (3,000+ 行)
│   ├── core/                       # 引擎 (engine/harness/checkpoint/storage/config)
│   ├── targets/                    # 4 种目标适配器
│   ├── suites/                     # 10 个攻击套件 + 2,089 条数据
│   ├── checks/                     # 6 种判定逻辑
│   ├── report/                     # 终端 + JSON 报告
│   ├── dashboard/                  # Web 后端 + 编译好的前端
│   ├── cli.py                      # CLI 入口
│   └── tui.py                      # TUI
├── web/                            # React 前端源码 (2,000+ 行)
├── tests/                          # 40 个测试
└── pyproject.toml
```

## 许可证

MIT
