# CLI 参考

```
agent-redteam [-h] [--version] {scan,list,serve,history,compare,mutate} ...
```

## `scan`

对一个 agent 目标跑红队扫描。

```
agent-redteam scan [--model MODEL] [--base-url BASE_URL] [--key KEY]
                    [--target {openai,claude,zai,local,ollama,deepseek,azure,qwen}]
                    [--endpoint ENDPOINT] [--suites SUITES]
                    [--max-tokens MAX_TOKENS] [--workers WORKERS]
                    [--format {terminal,json,markdown,sarif}]
                    [--fail-below SCORE] [--limit LIMIT] [--tui]
                    [--serve] [--port PORT]
```

| 参数 | 说明 |
|------|------|
| `--model` | 模型 ID（如 `gpt-4o`、`glm-4-plus`） |
| `--base-url` | API base URL（默认从 `~/.agent-redteam/config` 读取） |
| `--key` | API key |
| `--target` | 目标类型：`openai` / `claude` / `zai` / `local` / `ollama` / `deepseek` / `azure` / `qwen` |
| `--endpoint` | 本地 agent endpoint（`--target local` 时使用） |
| `--suites` | 只跑特定套件，逗号分隔（如 `injection,info_leak`） |
| `--max-tokens` | 单次响应最大 token 数 |
| `--workers` | 并行 API 调用数 |
| `--format` | `terminal`（默认）/ `json`（机器可读）/ `markdown`（文档）/ `sarif`（GitHub Security tab） |
| `--fail-below` | 总分低于此值则 exit 1（CI 集成用） |
| `--limit` | 每套件最多跑 N 条样本（调试/快速验证用） |
| `--tui` | 启动 Textual 实时界面 |
| `--serve` | 扫描完成后启动 Web Dashboard |
| `--port` | Dashboard 端口 |

示例：

```bash
# 完整扫描
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY

# CI 门禁：分数 < 80 则失败
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY --fail-below 80

# 只跑 3 个套件，每套件 20 条（快速 CI）
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY \
  --suites injection,info_leak,supply_chain --limit 20

# 扫描本地 agent（任意 HTTP 端点）
agent-redteam scan --target local --endpoint http://localhost:8000/chat

# 扫描完直接打开 Dashboard
agent-redteam scan --serve --model gpt-4o --key $OPENAI_API_KEY
```

## `list`

列出可用的攻击套件（无参数）。

```bash
agent-redteam list
```

输出每个套件的名称、OWASP 编号、样本数、一句话描述——这是套件数据的权威来源，
见 [套件说明](suites.md)。

## `serve`

启动 Web Dashboard。

```
agent-redteam serve [--host HOST] [--port PORT] [--no-browser]
```

| 参数 | 说明 |
|------|------|
| `--host` | 绑定地址 |
| `--port` | 端口 |
| `--no-browser` | 不自动打开浏览器 |

默认地址 `http://127.0.0.1:7878`。

## `history`

查看历史扫描记录（从 SQLite `~/.agent-redteam/scans.db` 读取）。

```
agent-redteam history [--limit LIMIT]
```

| 参数 | 说明 |
|------|------|
| `--limit` | 显示条数 |

## `compare`

对比两次扫描结果。

```
agent-redteam compare run_a run_b
```

| 参数 | 说明 |
|------|------|
| `run_a` | 第一次扫描的 run_id |
| `run_b` | 第二次扫描的 run_id |

run_id 可以从 `agent-redteam history` 的输出里拿到。

## `mutate`

给套件生成变异样本，缓解样本过时/被针对性修补的问题。

```
agent-redteam mutate --suite SUITE [--strategies STRATEGIES] [-n COUNT] [--seed SEED]
```

| 参数 | 说明 |
|------|------|
| `--suite` | 目标套件名（如 `injection`） |
| `--strategies` | 变异策略，逗号分隔 |
| `-n, --count` | 生成样本数 |
| `--seed` | 随机种子（可复现） |

11 种变异策略：`homoglyph` / `zero_width` / `reframe` / `synonym` / `base64` /
`url_encode` / `case_spoof` / `punctuation` / `multilingual` / `role_inject` / `split`。

```bash
agent-redteam mutate --suite injection --strategies base64,role_inject -n 20 --seed 42
```
