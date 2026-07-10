# Agent Redteam

**AI Agent 红队安全测试平台** — 给 AI agent 跑安全扫描，像 `npm audit` 一样简单。

CLI · TUI · Web Dashboard | 2,224 测试样本 · 13 攻击套件 · OWASP LLM 2025 十类均有测试

## 为什么需要它

AI agent 在没有安全检查的情况下就被发布——不像普通软件有 `npm audit`、`snyk scan`
这样的工具。**Agent Redteam 就是这个缺失的等效工具**：在 agent 上线前，系统性地从
13 个测试套件跑攻击测试，输出具体的 pass/fail 分数，而不是模糊的"感觉安全"。

- **零依赖核心** — Python stdlib only，`pip install agent-redteam` 不拉任何包。
- **API key 仅本地** — key 不经过任何第三方，不出现在 HTTP 响应中（有专门测试兜底）。
- **数字精确** — 每个套件的样本数、分数、判定逻辑都可复现，以 `agent-redteam list --format json --validate` 的实际输出为准。

## 十三个攻击套件（OWASP LLM Top 10 2025）

| 套件 | 测什么 | 样本量 | OWASP |
|------|--------|--------|-------|
| **injection** | Prompt 注入能否诱导 agent 执行危险操作 | 215 | LLM01 |
| **tool_abuse** | 破坏性工具调用（rm -rf / DROP TABLE）能否被拦截 | 200 | LLM01 |
| **multi_turn** | 多轮对话攻击：通过建立信任逐步逼近目标 | 50 | LLM01 |
| **supply_chain** | typosquatting / dependency confusion / CI-CD 投毒 | 215 | LLM03 |
| **data_poisoning** | 训练、微调和检索数据进入管道前的来源与完整性准入 | 20 | LLM04 |
| **model_dos** | token 耗尽 / 递归生成 / 上下文炸弹 | 200 | LLM10 |
| **excessive_agency** | agent 是否声称超出其能力的权限 | 200 | LLM06 |
| **info_leak** | 系统提示/工具定义/模型配置能否被套出 | 200 | LLM07 |
| **insecure_output** | 是否会生成恶意代码/webshell/exploit | 200 | LLM05 |
| **sensitive_data** | PII/凭据/密钥/训练数据泄露 | 200 | LLM02 |
| **vector_embedding** | 多租户隔离、权限检索、embedding 暴露与知识冲突 | 20 | LLM08 |
| **over_refusal** | 正当防御/教育问题是否被安全模型误拒 | 289 | PROJECT |
| **over_dependency** | 幻觉/过度自信——对不确定的事给了确定答案 | 215 | LLM09 |

**总计 2,224 条攻击样本**，OWASP LLM Top 10 2025 十个分类均有代表性测试；分类覆盖不等同于覆盖深度充分（以 `agent-redteam list --format json --validate` 为准）。详见 [风险分类法](taxonomy.md)。

## 三种使用方式

### 1. CLI

```bash
pip install agent-redteam
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY
agent-redteam scan --model ... --fail-below 80 --format json > report.json
```

完整命令参考见 [CLI 文档](cli.md)。

### 2. GitHub Action

在 CI 里加一段，每次 push/PR 自动跑安全扫描、写 PR 评论、上传 SARIF 到 Security tab。
见 [GitHub Action 集成](github-action.md)。

### 3. TUI / Web Dashboard

```bash
agent-redteam scan --tui --model ... --key ...   # 实时终端界面
agent-redteam scan --serve --model ... --key ...  # 浏览器 Dashboard，11 个页面
```

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

见 [Python API 参考](api.md)。

## 支持的目标

8 种目标适配器：OpenAI 兼容 / Anthropic Claude / Z.ai (GLM) / Ollama（本地免费）/
DeepSeek / Azure OpenAI / 通义千问 / 任意本地 HTTP 端点。见 [Target 配置指南](targets.md)。

## 真实安全基准

已在 GLM-5.2 / GLM-4.5 / GLM-4-Flash / qwen2.5:0.5b / llama3.2:1b 上跑过真实验证扫描，
数字可复现。见 [安全基准](benchmark.md)。

## 项目规模

| 维度 | 数值 |
|------|------|
| Python 核心 | 4,528 行（零核心依赖） |
| 前端 TS/TSX | 19,676 行（74 个组件，11 个页面） |
| 测试 | 240 个全绿 |
| 攻击样本 | 2,224 条（13 套件） |

## 许可证

MIT
