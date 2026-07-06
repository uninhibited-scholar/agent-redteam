# Agent Redteam — 项目状态文档

> **这是进行中的长期项目，不是已完成的项目。**
> 本文档记录演进历程与当前状态，供后续会话续接。项目仍在活跃开发中。
> 最近更新：2026-07-07

---

## 给接手 agent 的指令

如果你是新会话接手本项目的 agent：
1. 先完整读本文件，掌握项目全貌、约束、当前状态
2. **不要把它当"已交付"项目对待**——这是长期多周项目，当前体量（8,792 行）
   距离对标目标（Cherry Studio 规模，前端 8,000+ 行）还有约一半工作量
3. 看完「进行中的状态」和「下一步」两节，问用户要推进哪个方向，然后继续做
4. 遵守「核心约束」——尤其"不得仓促收尾""API key 绝不外泄"

---

## 项目定位

AI Agent 安全测试平台，覆盖 OWASP LLM Top 10 全部 10 类。三层界面：CLI →
Textual TUI → React+TypeScript Web Dashboard。零依赖 Python 核心（仅标准库），
WebSocket 实时遥测，SQLite 持久化，检查点/恢复。

- **仓库**：https://github.com/uninhibited-scholar/agent-redteam
- **路径**：`~/Desktop/agent-redteam`
- **GitHub 邮箱**：`238404526+uninhibited-scholar@users.noreply.github.com`
  （全局 git config 已设为此值；`.hk` 邮箱会被 GitHub 隐私保护拒绝 push）

## 核心约束（贯穿全程）

1. **API key 绝不出现在对话/前端/HTTP 响应/日志** —— 只从 `~/.agent-redteam/config` 读取
2. **不得仓促收尾** —— 这是长期多周项目，不要"提前交"
3. **对标 Cherry Studio 的体量与质量** —— 前端目标 8,000+ 行
4. **重复性任务委托给 Claude**（单独会话）做批量组件，但验收时必须独立核查

---

## 第一阶段：核心引擎 + CLI（2026-07-01）

**提交**：`96f3350` → `7689ff1` → `fb9aa7c`

- 11 种检查策略、10 个攻击套件（injection / tool_abuse / supply_chain / model_dos /
  excessive_agency / info_leak / insecure_output / sensitive_data / over_refusal / over_dependency）
- 严重度加权评分（critical=4x, high=3x, medium=2x, low=1x）
- ThreadPoolExecutor 并行执行 + 3 次重试退避
- CLI：`scan / list / serve / history / compare / mutate`

## 第二阶段：TUI + Dashboard 前端（2026-07-01）

**提交**：`2b679e5` → `1738506` → `e10bca2` → `a5a05d4`

- Textual TUI 实时扫描界面（标题在 `__init__` 而非类属性）
- 内嵌 Python `http.server` + 自实现 WebSocket（RFC 6455 握手 + 文本帧广播）
- React+TypeScript+Vite 前端，SOC 暗黑主题，纯 SVG 图表（无图表库）

## 第三阶段：OWASP Top 10 全覆盖 + 持久化（2026-07-02）

**提交**：`2ae4208` → `bcc8ac3` → `2785fc7` → `a1eb144`

- 新增 6 个套件，样本扩充至每套件 200 条（共 ~2,089 条）
- SQLite 存储扫描历史 + history/compare 命令
- 配置文件系统 + 断点续跑（`~/.agent-redteam/checkpoints/`）

## 第四阶段：Dashboard 打磨 + 变异器（2026-07-03 ~ 07-05）

**提交**：`f985a05` → `f72b131` → `48ad9da` → `fb3b80f`

- 修复 Dashboard 全黑 bug（`.js` MIME 类型）+ 端口占用（SO_REUSEADDR）
- 前端打磨 3 轮：ErrorBoundary / EmptyState / LoadingState / SummaryTiles / useApi hook
- 11 种变异策略（homoglyph / zero_width / reframe / synonym / base64 / url_encode /
  case_spoof / punctuation / multilingual / role_inject / split）
- Markdown 报告生成器 + `/api/export/{json,markdown}` + CLI `--format markdown`

---

## 第五阶段：仪表盘全栈升级（2026-07-06）⬅️ 最近一轮

**提交**：`da9648f` —— 28 文件，+3435/-282 行

这是从"组件写完"到"组件真正接入系统并用起来"的一轮。前一轮 Claude 生成了
10 个组件文件，但**全是孤立的**（0 处引用），本阶段把它们全部接进真实管线。
此阶段已完成，但项目整体仍在进行中（见下方「进行中的状态」）。

### 5.1 后端：3 个新数据端点 + 1 个 bug 修复

**新增端点**（`src/agent_redteam/dashboard/api.py`）：

| 端点 | 功能 |
|------|------|
| `GET /api/samples` | 服务端分页 + 过滤（suite/verdict/severity/difficulty/search）+ 排序 + facet 计数。排序语义：`desc` = 最危险优先（critical > high > medium > low） |
| `GET /api/risk-matrix` | 套件 × 严重性 的失败密度矩阵，按风险降序排列 |
| `GET /api/timeline` | 紧凑的执行顺序结果流（不含完整响应体） |

**修复潜伏 bug**：`POST /api/settings` 原本写在 `do_GET` 里（检查 `self.command == "POST"`），
但 POST 请求走 `do_POST`，所以**设置保存从来没生效过**。新增 `_handle_settings_post()`
并在 `do_POST` 注册路由。

**测试**：63 → **75 个**（+12 个端点测试）。

### 5.2 前端：10 组件接入 + 共享 UI 层

**共享 UI 原语层**（新文件 `web/src/components/ui.tsx`）：
收敛重复散落的视觉原语，统一 SOC 设计语言：
`Section`（支持 `variant='card' | 'subtle'`）/ `Field` / `Panel` / `Tooltip`（零依赖，自动翻转）
/ `SeverityBadge` / `MonoTag` / `TextInput` / `Slider` / `SmallButton` / `StatusText` / `KbdRow`

SettingsPanel + HelpOverlay 去重，改用共享原语。

**组件接入情况**：

| 组件 | 接入方式 |
|------|----------|
| DataTable | 扩展为**双模式排序**：受控模式（服务端分页）+ 非受控模式（客户端） |
| FilterBar + Pagination | Findings 页消费 `/api/samples`，verdict/severity/suite 三连过滤 + 分页 |
| DetailDrawer | Findings 行点击打开完整攻击/响应详情抽屉 |
| RiskMatrix + SampleTimeline | 集成进 Overview，与 ScoreGauge/Radar 并排 |
| SettingsPanel | **重写**：从 localStorage 改为对接后端 `/api/settings` |
| HelpOverlay | 改为受控组件（接受 `open`/`onClose`） |
| NotificationToast | `NotificationProvider` 包裹 App，ScanLauncher 接入 toast |

**CommandPalette**（新写，`web/src/components/CommandPalette.tsx`）：
⌘K 唤起的模糊搜索命令面板：页面跳转 + 导出/刷新/复制链接 + 完整键盘导航（↑↓↎ Esc）。

**全局键盘快捷键**：`⌘K` 命令面板、`1-7` 切换页面、`R` 刷新报告、`?` 帮助、`Esc` 关闭弹层。

### 5.3 图表交互增强

三个 SVG 图表全部加上 hover tooltip + click drilldown（这是最后一个未接入项）：

- **RadarChart**：悬停顶点放大高亮 + 显示该 suite 的 score/pass-fail/总数；非悬停标签自动变淡；点击顶点 → 跳到 Findings 并预筛选
- **HeatMap**：悬停格子缩放高亮 + 显示精确计数/通过率；点击格子 → Findings 同时按 suite + severity 双重筛选
- **ScoreGauge**：悬停圆环加粗 + 解释评分区间（≥80/50-79/<50）；悬停中心数字显示原始分

**下钻链路打通**：Overview 雷达顶点 → App 的 `pendingSuite` 状态 → Findings 的 `initialSuite` → 应用筛选 → 通知 toast。

### 5.4 代码卫生

- 严格 tsc（`--noUnusedLocals --noUnusedParameters`）**全项目零警告**（比项目默认配置更严）
- Findings 和 DetailDrawer 统一改用共享 `SeverityBadge`
- 旧 `SeverityBadge.tsx` 和 `VulnerabilityCard.tsx` 现已无人引用（保留未删）

---

## 当前体量（2026-07-06）

| 维度 | 数值 |
|------|------|
| Python 核心 | **3,865 行** |
| 前端 TS | **4,927 行** |
| **总计** | **8,792 行** |
| 测试 | **75 passed** |
| tsc 严格模式 | 零警告 |
| 攻击样本 | ~2,089 条（10 套件） |

---

## 关键文件索引

**Python 核心**：
- `src/agent_redteam/core/engine.py` — 主编排器，自动注册套件，扫描流程带检查点恢复
- `src/agent_redteam/core/result.py` — ScanReport/SuiteResult/SampleResult/Verdict，严重度加权评分
- `src/agent_redteam/core/harness.py` — ThreadPoolExecutor 并行执行，3 次重试退避
- `src/agent_redteam/core/storage.py` — SQLite 在 `~/.agent-redteam/scans.db`
- `src/agent_redteam/core/config.py` — 加载 `~/.agent-redteam/config`
- `src/agent_redteam/core/checkpoint.py` — JSONL 检查点
- `src/agent_redteam/mutate.py` — 11 种变异策略，自动检测 context/question/text 字段
- `src/agent_redteam/cli.py` — scan/list/serve/history/compare/mutate
- `src/agent_redteam/targets/zai_target.py` — **关键**。自动检测 7897/7890/1087/8080 端口代理，POST 到 `https://api.z.ai/api/anthropic/v1/messages`
- `src/agent_redteam/dashboard/api.py` — HTTP 服务器。**必须包含 `extensions_map` 设 `.js: "application/javascript"`**（曾导致黑屏）。新端点：samples/risk-matrix/timeline/settings
- `src/agent_redteam/dashboard/settings_api.py` — `~/.agent-redteam/settings.json`，模块级 `SETTINGS_PATH` 常量
- `src/agent_redteam/dashboard/server.py` — 最小 WebSocket 实现

**前端**：
- `web/src/theme.ts` — SOC 暗黑主题 + `globalStyles`
- `web/src/App.tsx` — 主布局，64px 侧边栏（7 导航项），NotificationProvider 包裹，CommandPalette + 快捷键
- `web/src/components/ui.tsx` — **共享 UI 原语**（Section/Field/Panel/Tooltip/SeverityBadge 等）
- `web/src/components/` — ErrorBoundary, EmptyState, SummaryTiles, HeatMap, RadarChart, ScoreGauge, SuiteBar, TelemetryStream, DataTable, FilterBar, Pagination, DetailDrawer, RiskMatrix, SampleTimeline, SettingsPanel, CommandPalette, HelpOverlay, NotificationToast
- `web/src/pages/` — Overview, Findings（服务端分页）, LiveScan, ScanLauncher, History, Compare, Settings

**测试**：
- `tests/test_core.py` — 40 个，覆盖结果模型/检查/套件加载/引擎扫描
- `tests/test_mutate.py` — 8 个，覆盖变异策略/黄金标签保留
- `tests/test_dashboard.py` — 27 个，含 3 个防 key 泄漏 + samples/risk-matrix/timeline/settings 端点

---

## 进行中的状态（截至 2026-07-07）

项目处于**仪表盘全栈化**阶段，刚完成第五阶段（数据端点 + 组件接入 + 图表交互），
但离对标目标还远。当前不是在收尾，而是在中段。

**已稳定的部分**（可运行、有测试、已接入）：
- 核心 Python 引擎 + CLI + TUI + Dashboard 后端
- 10 个攻击套件 ~2,089 条样本 + 11 种变异策略
- Dashboard 前端 7 个页面，全部接真实 API，图表有 hover/click 交互
- 共享 UI 原语层 + 全局命令面板 + 通知系统

**正在进行 / 下一步可推进的方向**（按优先级，由用户决定）：

1. **扩大前端规模至 8,000+ 行**（当前 4,927，差约 3,000 行）
   - 更多可视化：趋势图、分布图、多模型对比图、时间线详情
   - 样本详情/编辑视图、套件管理界面
   - 这是"对标 Cherry Studio 体量"的核心指标，未达标
2. **多模型比较数据** — 跑 2-3 个模型（GLM-5.2 / GPT-4o / Claude），生成真实对比报告
3. **PyPI 发布** + 文档网站 + 技术文章
4. **安全审计** — 对自身做一次红队测试（吃自己的狗粮）

> 接手 agent 注意：不要假设上面的方向是"最终清单"。问用户当前优先做哪个。

---

## 开发中踩过的坑（避免重复）

1. **Claude 的"完成"≠"能用"**：它会交付文件（能过 tsc），但不会主动接入系统。验收时必须查引用计数 + 运行，不能只看自报。
2. **宽松 tsc 会掩盖死代码**：项目 `noUnusedLocals: false`，所以默认 tsc 不查死代码。验收用 `--noUnusedLocals --noUnusedParameters` 重跑。
3. **POST 路由别写在 do_GET 里**：检查 `self.command` 的写法看起来合理，但 POST 永远走 `do_POST`，do_GET 里的 POST 分支永不触发。
4. **push 失败先查 committer 邮箱**：GitHub 隐私保护会拒绝含私密邮箱的 push。全局 git config 必须是 `238404526+uninhibited-scholar@users.noreply.github.com`。
5. **服务端分页必须服务端排序**：客户端排序只排当前页，毫无意义。DataTable 需支持受控排序模式。

---

## 常用命令

```bash
cd ~/Desktop/agent-redteam

# 跑测试
python -m pytest tests/ -q          # 应 75 passed
cd web && npx tsc --noEmit           # 应零错误
npx tsc --noEmit --noUnusedLocals --noUnusedParameters  # 严格模式，应零警告
npm run build                       # 构建前端到 dashboard/static/

# 启动 dashboard
agent-redteam serve                  # http://127.0.0.1:7878

# 真实扫描（需要 ~/.agent-redteam/config 配好 api_key + Cloudflare WARP 代理）
agent-redteam scan --target zai --model GLM-5.2 --limit 30
```

## 委托 Claude 做批量组件的协作模式

写任务书（含 props 签名 + 目标行数 + 设计语言约束），让它生成独立文件，
但**接入工作自己做**——因为 Claude 不会主动把组件连到真实 API。
验收时：查引用计数（`grep -rl "ComponentName" src/`）+ 严格 tsc + 实际渲染。

