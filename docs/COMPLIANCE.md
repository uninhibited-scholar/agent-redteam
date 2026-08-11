# 合规与可复现性披露

> 适用：赛道三「开放探索」复赛（2026-09-03）起强制项。
> 依据：《赛道三参赛手册》§06「开源与合规」要求。

本项目所有实验均使用**公开可访问的商业大模型 API**，不涉及私有部署或受限数据。本文档完整披露调用环节、费用假设、可替代性、随机种子与第三方依赖，确保第三方在等价条件下可复现。

---

## 1. 商业 API 披露

实验过程中调用了两类商业 API，均为公开注册、按量计费，无特殊权限要求：

| 供应商 | 端点 | 协议 | 调用模型 | 用途 | 可替代性 |
|---|---|---|---|---|---|
| 智谱 AI (Z.ai) | `https://api.z.ai/api/anthropic` | Anthropic Messages | GLM-5.2 | 文本注入主目标 + 盲审裁判 | ✅ 可换 Claude/OpenAI（需调协议适配器） |
| 火山引擎 (Volcano Ark) | `https://ark.cn-beijing.volces.com` | OpenAI Chat | doubao-2.0-pro/code/lite、DeepSeek-v4 | 跨模型视觉/文本对照 | ✅ 可换任意 OpenAI 兼容端点 |
| 智谱 AI | 同上 | OpenAI Chat | glm-4v-flash | 视觉通道（6 模型之一） | ✅ 同上 |
| Moonshot | `https://api.moonshot.cn` | OpenAI Chat | kimi-k2-7 | 视觉通道（6 模型之一） | ✅ 同上 |
| MiniMax | `https://api.minimaxi.chat` | OpenAI Chat | minimax-m3 | 视觉通道（6 模型之一） | ✅ 同上 |
| Ollama（本地） | `http://localhost:11434` | — | llama3.2:1b、qwen2.5:0.5b | 多轮能力梯度基线（免费） | ✅ 本地推理，零 API 费用 |

### 调用环节

```
scan 实验流程:
  agent-redteam CLI → Target 适配器 → 商业 API → 返回响应 → 评分器判定
                                         ↑
                              key 仅从 ~/.agent-redteam/config 读取,
                              不进代码、不进日志、不进 HTTP 响应头
```

- **key 管理**：API key 仅从本地配置文件 `~/.agent-redteam/config` 读取，不出现在源码、测试用例、日志输出或 HTTP 响应中（有专门测试 `tests/test_no_key_leak.py` 兜底）。
- **key 不经过任何第三方**：本工具自身不上报任何遥测，key 请求直达供应商端点。

### 费用假设

- 文本通道（D1/D2/D3）：单次扫描 ~300 样本 × 8 模型 ≈ 2,400 次调用，按主流模型定价估算 < ¥10。
- 视觉通道（expB）：6 模型 × 120 样本 = 720 次调用，估算 < ¥5。
- κ 盲审：40 次裁判调用，可忽略。
- **合计估算 < ¥20**，所有调用量均在免费额度或低成本范围内。

### 可替代性声明

所有实验**不依赖特定供应商**。替换模型只需改 `~/.agent-redteam/config` 的 `target` / `model` / `api_key` 三项，无需改代码。本地 Ollama 路径完全免费，可用于零成本复现能力梯度对照（D3 多轮已有 llama3.2/qwen2.5 基线）。

---

## 2. 随机种子与可复现性

本项目的三条路径对随机性的依赖程度不同：

| 路径 | 是否含随机性 | 复现方式 |
|---|---|---|
| `scan`（主实验，D1/D4） | ❌ 无 | 套件样本为**固定数据集**，顺序稳定，无需 seed 即可逐字节复现 |
| `mutate`（D2 变异） | ✅ 有 | CLI 参数 `--seed`，固定后可复现 |
| `adaptive`（D5 进化） | ✅ 有 | 由 seed_suites + mutations_per_seed 参数化，固定参数可复现 |

### 主实验（scan）的复现

```bash
# 这条命令的输出可逐字节复现（同一模型同一套件）
agent-redteam scan --target zai --model GLM-5.2 --suites injection --limit 30
```

套件样本来自 `src/agent_redteam/suites/*/` 下的固定 JSON/JSONL 文件，加载顺序由 `Engine` 确定性遍历，不引入随机性。

### 变异实验（mutate）的复现

```bash
# 固定 seed 后可复现变异结果
agent-redteam mutate --suite injection --strategies all --count 120 --seed 42
```

⚠️ **已知缺口**：`mutate` 的 `--seed` 默认为 `None`（系统随机）。现有 `validation/MUTATION-REPORT.md` 的 n=55 数据未显式记录 seed 值，**严格意义上不可逐字节复现**，但策略分布与 bypass 率在重新生成时统计等价。复赛材料中该批数据已标注为「preliminary signal」。

### 进化实验（adaptive）的复现

```bash
agent-redteam adaptive --target zai --model GLM-5.2 --suites injection \
  --rounds 10 --target-bypasses 10 --mutations 3
```

参数固定后可复现。现有 D5 数据（n=2）已标注「统计不充分，不计入结论」。

---

## 3. 第三方依赖披露

### 核心包：零依赖

`agent-redteam` 核心功能（CLI、扫描、评分、报告）**零外部运行时依赖**，仅使用 Python 标准库：

```toml
[project]
dependencies = []   # ← 空，pip install 不拉任何包
```

这是刻意设计——在测试供应链攻击的同时不增加供应链风险。`requires-python = ">=3.10"`。

### 可选依赖（extras）

以下功能为可选安装，不影响核心扫描：

| Extra | 包 | 用途 | 是否必须 |
|---|---|---|---|
| `[tui]` | `textual>=0.40.0` | 终端交互界面 | ❌ 可选 |
| `[vision]` | `pillow>=9.0` | 视觉攻击图片渲染（expB） | ❌ 可选（仅渲染时需要） |
| `[ssl]` | `certifi` | SSL 证书校验 | ❌ 可选 |
| `[dev]` | `pytest>=7.0`, `pytest-cov` | 开发测试 | ❌ 仅开发时 |

安装方式：`pip install agent-redteam[tui,vision]`。

### 本地推理依赖

若使用 Ollama 路径（免费基线），需另行安装 [Ollama](https://ollama.ai) 并拉取模型：

```bash
ollama pull llama3.2:1b
ollama pull qwen2.5:0.5b
```

这是外部二进制，不计入 Python 依赖。

### 供应链安全

- 所有依赖通过 PyPI 官方源安装，未使用私有镜像或锁文件。
- 核心零依赖意味着供应链攻击面最小化——这本身是本项目的研究立论之一。

---

## 4. 数据与代码可用性

- **代码**：MIT 许可，GitHub 公开仓库 `uninhibited-scholar/agent-redteam`。
- **样本数据**：14 套件 / 2,319 样本随包发布（`src/agent_redteam/suites/`）。
- **实验日志**：`validation/` 目录含完整运行日志与聚合报告。
- **原始 response**：部分实验仅存 `response_excerpt`（≤300 字符，节省存储），完整 response 未持久化——这是 κ 盲审截断伪影的根因（已在 `validation/kappa-reanalysis.py` 与论文 §Limitations 诚实披露）。
