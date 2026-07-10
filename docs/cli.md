# CLI 参考

```
agent-redteam [-h] [--version]
              {scan,list,serve,history,compare,mutate,doctor,attest,init,ci,regress,sbom,report,review,evidence,release-check,manifest} ...
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

## `evidence`

为 `validation/` 目录生成可复现证据索引。

```bash
agent-redteam evidence --root validation
agent-redteam evidence --root validation --format json
agent-redteam evidence --root validation --output validation/EVIDENCE_INDEX.md
```

索引会汇总扫描 JSON、已知辅助 JSON 产物、Markdown 验证报告，并记录 SHA-256。
未知 JSON 会显式列为 skipped，避免静默误读。

## `regress`

对比基线和当前扫描 JSON，发现安全回归。

```bash
agent-redteam regress baseline.json current.json
agent-redteam regress baseline.json current.json --format json
agent-redteam regress baseline.json current.json --format markdown --output regression.md
```

默认门禁：

- 总分下降不能超过 `--max-score-drop`（默认 `2.0`）
- 新增 `critical` failure 不能超过 `--max-new-critical`（默认 `0`）
- 新增 `high` failure 不能超过 `--max-new-high`（默认 `0`）

这能捕捉“总体分数提升，但关键安全样本退步”的情况。需要更宽松策略时，可显式调高阈值。
默认策略故意不对称：总分允许 2 分波动，是为了吸收模型采样和供应商路由噪声；
新增或升级到 `critical` / `high` 的失败默认零容忍，因为这代表具体安全风险变坏。
同一个 `(suite, sample_id)` 从 `high` 升级到 `critical` 也会被视为回归。
如果两个报告的样本总数或 suite 集合不同，`regress` 会失败并提示报告不可比。

## `ci` waivers

`ci` 支持有过期时间的风险接受文件，用于临时放行已知失败，而不是调松全局策略。

```bash
agent-redteam ci scan.json --waivers .agent-redteam-waivers.json
agent-redteam ci --print-sample-waivers
```

waiver JSON 示例：

```json
{
  "waivers": [
    {
      "suite": "injection",
      "sample_id": "inj-001",
      "owner": "security@example.com",
      "reason": "Accepted until upstream agent policy change lands.",
      "expires": "2026-08-09"
    }
  ]
}
```

规则：

- active waiver 会从 high/critical failure 统计中扣除
- expired、字段不完整或超过 `max_waiver_days` 的 waiver 会让 CI gate 失败
- 未命中的 active waiver 会显示为 warning，提示清理旧风险接受项
- owner/reason/sample metadata 会按现有脱敏规则渲染
- 默认最长 waiver 窗口是 90 天，可在 policy 中显式设置 `max_waiver_days`

## `policy-lint`

`policy-lint` 不需要扫描报告，用于在 PR 或发布前提前检查 CI policy 与 waiver 文件。

```bash
agent-redteam policy-lint --policy .agent-redteam-policy.yml
agent-redteam policy-lint --policy .agent-redteam-policy.yml --waivers .agent-redteam-waivers.json
agent-redteam policy-lint --waivers .agent-redteam-waivers.json --format json
```

它会检查：

- policy 阈值是否在合理范围内
- 是否存在未知 policy key
- waiver 是否缺字段、过期或超过 `max_waiver_days`
- waiver 是否存在重复 `(suite, sample_id)` key

## `sbom`

生成本地软件物料清单（SBOM），用于供应链审计和发布交付。

```bash
agent-redteam sbom --format json
agent-redteam sbom --format markdown --output SBOM.md
agent-redteam sbom --runtime-only --format json
```

SBOM 从本地文件生成，不联网、不查询漏洞库：

- `pyproject.toml`：Python package、运行时依赖、可选/开发依赖
- `web/package-lock.json`：前端 npm 依赖、版本、license、integrity
- `dist/`：wheel/sdist 等 release artifact 的 SHA-256

## `release-check`

本地发布前门禁，组合 doctor、pytest、前端检查、证据索引、SBOM 和包产物检查。

```bash
agent-redteam release-check
agent-redteam release-check --strict-warnings
agent-redteam release-check --format json
```

`release-check` 会要求 wheel/sdist 存在；如果安装了 `twine`，还会运行 `twine check`。
缺少 `twine` 时只跳过包元数据检查，不跳过包文件存在性检查。
它也会生成 JSON SBOM 并确认至少包含项目组件。

## `manifest`

生成可复现发布清单，适合随 release 附上或交给审阅者复核。

```bash
agent-redteam manifest --format json
agent-redteam manifest --format markdown --output RELEASE_MANIFEST.md
agent-redteam manifest --include-release-check --format json
```

清单包含：

- 项目版本和生成时间
- git commit、分支、dirty 状态和变更文件计数
- wheel/sdist 的存在性、字节数和 SHA-256
- validation evidence 摘要
- 可选的 release-check 步骤结果
