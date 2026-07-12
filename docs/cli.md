# CLI 参考

```
agent-redteam [-h] [--version]
              {scan,benchmark,list,serve,history,compare,mutate,doctor,attest,init,ci,policy-lint,regress,sbom,report,review,evidence,release-check,manifest} ...
```

## `scan`

对一个 agent 目标跑红队扫描。

```
agent-redteam scan [--model MODEL] [--base-url BASE_URL] [--key KEY]
                    [--target {openai,claude,zai,local,ollama,deepseek,azure,qwen}]
                    [--endpoint ENDPOINT] [--suites SUITES]
                    [--max-tokens MAX_TOKENS] [--workers WORKERS]
                    [--max-attempts MAX_ATTEMPTS]
                    [--format {terminal,json,markdown,sarif}]
                    [--fail-below SCORE] [--allow-errors] [--limit LIMIT] [--tui]
                    [--dry-run] [--serve] [--port PORT]
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
| `--max-attempts` | 每次模型调用最多总尝试次数（1–10，默认 3） |
| `--format` | `terminal`（默认）/ `json`（机器可读）/ `markdown`（文档）/ `sarif`（GitHub Security tab） |
| `--fail-below` | 总分低于此值则 exit 1（CI 集成用） |
| `--allow-errors` | 明确允许部分样本为 `ERROR`；零有效判定仍 exit 1 |
| `--limit` | 每套件最多跑 N 条样本（调试/快速验证用） |
| `--dry-run` | 离线计算 suite 范围、模型调用数和最大输出 token 预算，不创建 target 或发送请求 |
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

# 先确认调用量和最大输出预算；不会联网
agent-redteam scan --model gpt-4o --suites all --dry-run
agent-redteam scan --model gpt-4o --suites injection,info_leak \
  --limit 20 --dry-run --format json

# 扫描本地 agent（任意 HTTP 端点）
agent-redteam scan --target local --endpoint http://localhost:8000/chat

# 扫描完直接打开 Dashboard
agent-redteam scan --serve --model gpt-4o --key $OPENAI_API_KEY
```

`--dry-run` 的 `output_token_ceiling` 是 `planned calls × max_tokens`，表示不含重试的
模型输出理论上限；multi-turn 场景会按实际 turn 数计入 planned calls。输出还会给出
`max_calls_with_retries` 与 `max_output_token_ceiling_with_retries`，按 `--max-attempts`
计算最坏上限。
它不估算输入 token，也不根据供应商价格推算费用。`suites: all` 会展开全部
内置 suite；未知、重复或与 `all` 混用的 suite 名会在发送请求前返回 exit 2。

真实扫描默认要求每条样本都获得 `PASS` 或 `FAIL` 判定：存在 `ERROR`、`SKIP` 或完全
没有有效判定时返回 exit 1。临时 API 错误可直接重跑并由 checkpoint 续扫；只有明确
接受部分结果时才使用 `--allow-errors`。JSON、Markdown 和 SARIF 正文只写 stdout，
进度与失败原因写 stderr，因此重定向后的机器可读文件保持可解析。

重试策略在单轮和多轮路径一致：HTTP 408/409/425/429、5xx 及网络异常可重试；
其他 4xx（例如 401/403）立即失败，避免用错误凭证重复等待。`Retry-After` 秒数会被
尊重，但单次等待最多 30 秒。空白或非文本模型响应同样会重试；耗尽后记为 `ERROR`，
不会被 check 误当成安全拒绝。

已有 JSON 可离线转换为 SARIF，无需再次调用模型：

```bash
agent-redteam report report.json --format sarif --output report.sarif
```

## `benchmark`

按固定 profile 运行可复现的 benchmark。`standard` 固定套件列表、每套件最多 50 条样本、
seed、`max_tokens`、重试次数和并发数；同一 profile 会通过 `selection_sha256` 证明抽样集合一致。

```bash
agent-redteam benchmark --profile standard --model gpt-4o --format json -o benchmark.json
agent-redteam benchmark --profile standard --model gpt-4o --dry-run --format json
```

profile 元数据会写入标准 scan report 的 `benchmark_profile` 字段。`--dry-run` 完全离线，
不会验证模型或 API key，也不会发送网络请求。

报告还会记录 `profile_sha256`、`selection_sha256` 和
`selection_content_sha256`：前者锁定 benchmark 配置，第二个锁定选中的 sample ID，
第三个锁定选中样本的完整内容。跨版本比较时三者应保持一致；如果样本正文或 gold
标签被修改，即使 sample ID 没变，内容哈希也会变化。

## `list`

列出内置攻击套件与样本 catalog（不调用模型或扫描引擎）。

```bash
agent-redteam list
agent-redteam list --format json --validate
agent-redteam list --format markdown
```

输出每个套件的名称、OWASP 编号、样本数与模式；`json` 还包含 severity/OWASP 分布，
以及存在结构化决策标签的套件的 `decision` 分布（例如 injection 的 `block:215, allow:40`）。
`--validate` 会在样本缺少 `id`/`owasp`/severity、存在重复 ID 或 suite 与样本的 OWASP 映射不一致时返回 exit 1，适合在维护样本时使用。见 [套件说明](suites.md)。

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

扫描报告还会在 injection/tool_abuse 这类同时包含 `allow` 与 `block` 的套件中记录双向指标：
`block_recall`、`allow_acceptance` 和 `balanced_score`。如需防止单向策略通过 CI，可在 policy 中显式设置
`min_allow_acceptance: 80`；该策略启用但报告没有可用的二元决策指标时会失败闭合。

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

本地发布前门禁，组合 doctor、pytest、前端检查、离线 sample-audit、证据索引、SBOM 和包产物检查。

```bash
agent-redteam release-check
agent-redteam release-check --strict-warnings
agent-redteam release-check --format json
```

`release-check` 会要求 wheel/sdist 存在；如果安装了 `twine`，还会运行 `twine check`。
缺少 `twine` 时只跳过包元数据检查，不跳过包文件存在性检查。
它也会生成 JSON SBOM 并确认至少包含项目组件。
sample-audit 的质量 error 会阻断发布，warning 会保留在门禁结果中但不会单独阻断。

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
