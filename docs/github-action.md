# GitHub Action 集成

`uninhibited-scholar/agent-redteam` 是一个 composite action，在 CI 里跑安全扫描、
上传 SARIF 到 GitHub Security tab、把结果评论到 PR 上。

## 最小示例

```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write   # SARIF 上传需要
      pull-requests: write     # PR 评论需要
    steps:
      - uses: actions/checkout@v4
      - uses: uninhibited-scholar/agent-redteam@v0.3.0
        with:
          model: gpt-4o
          api-key: ${{ secrets.OPENAI_API_KEY }}
          fail-below: "70"
          limit: "20"
```

## Inputs

| Input | 必填 | 默认 | 说明 |
|-------|------|------|------|
| `model` | 是 | — | 模型 ID（如 `gpt-4o`、`glm-4-plus`、`llama3`） |
| `target` | 否 | `openai` | `openai` / `claude` / `zai` / `ollama` / `deepseek` / `azure` / `qwen` / `local` |
| `api-key` | 否 | `""` | API key（用 `secrets`！）。ollama/local 不需要 |
| `base-url` | 否 | `""` | 自定义 API base URL |
| `fail-below` | 否 | `"0"` | 分数低于此值 CI 失败（0-100，`0` = 不设门禁） |
| `suites` | 否 | `""` | 逗号分隔套件名（默认全部 13 个） |
| `limit` | 否 | `"20"` | 每套件最大样本数 |
| `max-tokens` | 否 | `"500"` | 响应最大 token 数 |
| `workers` | 否 | `"4"` | 并行 API 调用数 |
| `max-attempts` | 否 | `"3"` | 每次模型调用最多总尝试次数（1-10） |
| `upload-sarif` | 否 | `"true"` | 是否上传 SARIF 到 Security tab |
| `pr-comment` | 否 | `"true"` | 是否在 PR 上评论结果（存在则更新，不存在则新建） |

## Outputs

| Output | 说明 |
|--------|------|
| `score` | 总分（0-100） |
| `total-samples` | 测试的样本总数 |
| `total-failed` | 失败样本数 |
| `total-errors` | 未获得安全判定的样本数 |
| `run-status` | 执行完整性：`complete` / `incomplete` / `no_data` |
| `sarif-file` | 生成的 SARIF 文件路径 |

在后续 step 里引用：

```yaml
- name: Show results
  if: always()
  run: |
    echo "## 🛡️ Security Score: ${{ steps.scan.outputs.score }}/100" >> $GITHUB_STEP_SUMMARY
    echo "${{ steps.scan.outputs.total-failed }} failures out of ${{ steps.scan.outputs.total-samples }} samples" >> $GITHUB_STEP_SUMMARY
    echo "Run: ${{ steps.scan.outputs.run-status }} (${{ steps.scan.outputs.total-errors }} errors)" >> $GITHUB_STEP_SUMMARY
```

（记得给这个 step 起 `id: scan`。）

## 完整示例（含 job summary）

见仓库内 [`.github/workflows/example-scan.yml`](https://github.com/uninhibited-scholar/agent-redteam/blob/main/.github/workflows/example-scan.yml)，
内容包括：

```yaml
name: Security Scan
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  security-events: write
  pull-requests: write
  actions: read

jobs:
  redteam-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run agent-redteam scan
        id: scan
        uses: uninhibited-scholar/agent-redteam@v0.3.0
        with:
          model: gpt-4o
          target: openai
          api-key: ${{ secrets.OPENAI_API_KEY }}
          fail-below: "70"
          limit: "20"
      - name: Show results in job summary
        if: always()
        run: |
          echo "## 🛡️ Security Scan Results" >> $GITHUB_STEP_SUMMARY
          echo "| Metric | Value |" >> $GITHUB_STEP_SUMMARY
          echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
          echo "| **Score** | ${{ steps.scan.outputs.score }}/100 |" >> $GITHUB_STEP_SUMMARY
          echo "| **Samples** | ${{ steps.scan.outputs.total-samples }} |" >> $GITHUB_STEP_SUMMARY
          echo "| **Failed** | ${{ steps.scan.outputs.total-failed }} |" >> $GITHUB_STEP_SUMMARY
          echo "| **Errors** | ${{ steps.scan.outputs.total-errors }} |" >> $GITHUB_STEP_SUMMARY
          echo "| **Run status** | ${{ steps.scan.outputs.run-status }} |" >> $GITHUB_STEP_SUMMARY
```

你得到什么：

1. **CI 门禁** — PR 分数低于 `fail-below` 就失败
2. **PR 评论** — 自动发布分数表 + 套件明细，重新扫描会更新同一条评论而不是刷屏
3. **Security tab** — SARIF 结果出现在 GitHub Security → Code Scanning
4. **Job summary** — 分数出现在 Actions 运行页摘要里

## 其他 target 配置

```yaml
# GLM (Z.ai)
- uses: uninhibited-scholar/agent-redteam@v0.3.0
  with:
    model: GLM-5.2
    target: zai
    api-key: ${{ secrets.ZAI_API_KEY }}

# Ollama（本地，免费，无需 key）
- uses: uninhibited-scholar/agent-redteam@v0.3.0
  with:
    model: llama3
    target: ollama
    limit: "10"

# DeepSeek
- uses: uninhibited-scholar/agent-redteam@v0.3.0
  with:
    model: deepseek-chat
    target: deepseek
    api-key: ${{ secrets.DEEPSEEK_API_KEY }}

# 通义千问
- uses: uninhibited-scholar/agent-redteam@v0.3.0
  with:
    model: qwen-plus
    target: qwen
    api-key: ${{ secrets.DASHSCOPE_API_KEY }}

# 只跑指定套件（更快的 CI）
- uses: uninhibited-scholar/agent-redteam@v0.3.0
  with:
    model: gpt-4o
    api-key: ${{ secrets.OPENAI_API_KEY }}
    suites: injection,info_leak,supply_chain
    limit: "15"
```

## PR 评论格式

Action 生成的评论长这样（分数表 + 套件明细 + verdict）：

```
## agent-redteam Security Scan

| Metric | Value |
|--------|-------|
| **Model** | gpt-4o |
| **Score** | **84.6/100** |
| **Samples** | 300 |
| **Failed** | 53 |

### Suite Breakdown

| Suite | Score | Pass/Total | Status |
|-------|-------|------------|--------|
| injection | 100.0 | 30/30 | OK |
| supply_chain | 53.3 | 16/30 | FAIL |
...

**PASS** — Score 84.6/100
```

评论用一个 HTML 注释 marker 去重——重新扫描会更新同一条评论，不会每次 push 都刷一条新的。
