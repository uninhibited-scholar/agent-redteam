# 快速上手

## 安装

```bash
pip install agent-redteam
```

零核心依赖（Python stdlib only）。可选 extras：

```bash
pip install agent-redteam[tui]   # 需要实时终端界面
pip install agent-redteam[dev]   # 跑测试/开发
```

从源码安装：

```bash
git clone https://github.com/uninhibited-scholar/agent-redteam
cd agent-redteam
pip install -e ".[dev,tui]"
```

## 配置 API key

两种方式，任选一种：

**方式 1 — 环境变量**（最简单）：

```bash
export OPENAI_API_KEY=sk-...
agent-redteam scan --model gpt-4o
```

**方式 2 — 配置文件**（Dashboard 启动扫描需要）：

```bash
cp config.example ~/.agent-redteam/config
# 编辑 ~/.agent-redteam/config，填入 api_key
```

配置文件字段：

```yaml
api_key: <your-key-here>
model: glm-4-plus          # 可选默认值
base_url: https://open.bigmodel.cn/api/paas/v4
workers: 4
max_tokens: 500
```

> key 只从本地配置读取，绝不出现在前端、HTTP 响应或日志里——有专门的测试兜底
> (`tests/test_dashboard.py` 含 3 个防泄漏测试)。

## 第一次扫描

```bash
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY
```

默认跑全部 13 个套件、每套件全部样本（2,224 条），终端会输出实时进度条 + 最终报告。

建议首次运行前先做离线预检，确认模型调用量与最大输出预算：

```bash
agent-redteam scan --model gpt-4o --suites all --dry-run
```

预检不会创建 target、读取远端数据或发送模型请求。完整扫描调用量较大时，可用
`--suites` 和 `--limit` 缩小范围后再次预检。

**先跑一个小规模的**（每套件限量 10 条，几十秒内出结果）：

```bash
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY --limit 10
```

**只跑某几个套件**：

```bash
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY \
  --suites injection,info_leak,supply_chain --limit 20
```

## 看结果

终端报告默认输出每个套件的分数 + pass/fail 计数 + 总分。想要机器可读格式：

```bash
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY --format json > report.json
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY --format markdown > report.md
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY --format sarif > report.sarif
```

## 打开 Web Dashboard

```bash
agent-redteam serve
# 浏览器自动打开 http://127.0.0.1:7878
```

Dashboard 有 11 个页面：Overview（雷达图+仪表盘）、Findings（漏洞卡片墙+服务端分页）、
LiveScan（实时遥测流）、ScanLauncher（配置启动扫描）、History（历史对比）、
Compare（A/B 模型对比）、Metrics、Remediation、SuiteDetail、Settings。

也可以直接扫描完自动打开：

```bash
agent-redteam scan --serve --model gpt-4o --key $OPENAI_API_KEY
```

## CI 集成（快速版）

```bash
agent-redteam scan --model gpt-4o --key $OPENAI_API_KEY \
  --fail-below 80 --format json > report.json
# 分数 < 80 时 exit code 非 0，可直接接 CI 门禁
```

更完整的 GitHub Action 用法见 [GitHub Action 集成](github-action.md)。

## 下一步

- [CLI 完整文档](cli.md) — 所有子命令和参数
- [Target 配置指南](targets.md) — 8 种目标适配器怎么配
- [套件说明](suites.md) — 13 个攻击套件测什么
- [Python API](api.md) — 用代码而不是 CLI 跑扫描
