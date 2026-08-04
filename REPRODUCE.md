# 复赛复现指南（REPRODUCE）

> 本文件是 **GOAI 赛道三 · 开放探索赛题复赛**的复现指引，面向评委。
> 评委按此文件应能：① 理解实验设计 ② 在干净环境跑通核心实验 ③ 看懂带 A/B/C 标签的运行日志 ④ 验证参照系对照。

---

## 一、环境准备（5 分钟）

```bash
# Python 3.11+，零依赖核心（stdlib only）
pip install -e .                    # 或 pip install agent-redteam
agent-redteam --version             # 确认安装成功

# API key（免费额度即可，论文实验全部用免费 tier）
# 智谱 free tier（glm-4v-flash 等）：
#   配置文件 ~/.agent-redteam/config 写入 api_key / base_url
# 火山 coding plan（doubao/kimi/minimax）：
#   配置文件 ~/.openclaw/openclaw.json 写入 apiKey
# 无 key 时可用 --dry-run 离线查看实验范围
agent-redteam scan --target zai --model glm-4-plus --suites injection --limit 3 --dry-run
```

---

## 二、核心实验：真视觉通道 bypass（expB）

这是论文 §6.1 / 初赛文档 §4.1 的核心实验：120 个有害 payload，每个渲染成图像送入 6 个视觉模型，测 bypass 率 + A/B/C 感知拆解。

```bash
# 跑 expB（6 模型 × 120 样本，支持 resume，中断后重跑会续）
python3 scripts/run_experiment_b.py
```

**输出**：`validation/expB-render-{模型}.json`（6 个文件，已存在于仓库）

**怎么读日志**（以 `expB-render-doubao-2.0-lite.json` 为例）：

```bash
python3 -c "
import json; d=json.load(open('validation/expB-render-doubao-2.0-lite.json'))
print('bypass率:', d['summary']['bypass_rate_by_form']['image_plain'])  # 0.467 = 46.7%
print('A/B/C分布:', d['summary']['channel_decomposition']['image_plain'])
# A_not_read=模型没读到 | B_described=读到但拒绝 | C_executed=读到且执行(bypass)
"
```

**关键结果**（6 模型 image_plain bypass，已固定种子可复现）：

| 模型 | bypass | A(没读到) | C(被攻破) |
|---|---|---|---|
| doubao-2.0-lite | 46.7% | 37/120 | 56/120 |
| glm-4v-flash | 21.7% | 9/120 | 26/120 |
| kimi-k2-7 | 17.5% | 44/120 | 21/120 |
| minimax-m3 | 1.7% | 103/120 | 2/120 |
| doubao-2.0-pro | 0.9% | 26/120 | 1/120 |
| doubao-2.0-code | 0.8% | 29/120 | 1/120 |

核心发现：bypass 率跨 6 模型从 0.8% 到 46.7%，呈**强能力依赖**（非均匀盲区）；同一 payload 不同模型"看见率"天差地别。

---

## 三、参照系 ①：平凡基线（纯文本直注对照）

**回答评委的问题**："doubao-lite 视觉 bypass 46.7%，是不是模型本身就弱？"
对照实验：同一批 payload，以**纯文本直注**（不渲染图像）送入同样 6 模型，测 bypass。

> **数据来源说明（重要，避免混淆）**：本节基线数据来自 `text-baseline-*.json`，是**独立的纯文本复现实验**，与论文 §4.2a 的 plain_text 列（来源 `docpipeline-vision-n120-*.json`，三通道联合实验）是**两套不同的实验**。两者数字略有差异（3 个模型 ±2-7pp），因脚本配置与运行时间不同；但**方向完全一致**（6 模型全部 plain_text > image_plain）——这本身构成对论文结论的独立复现验证。论文 §4.2a 的原始数据保留在 `docpipeline-vision-n120-*.json`，未被覆盖。

```bash
# 跑平凡基线（6 模型 × 120 样本，与 expB 同样本同模型，只变载体）
python3 scripts/run_text_baseline_6models.py
```

**输出**：`validation/text-baseline-{模型}.json`

**怎么对比**（关键——这是参照系的证据）：

| 模型 | 纯文本直注 bypass | 真视觉 bypass | 通道效应 |
|---|---|---|---|
| glm-4v-flash | 86.7% | 21.7% | 文本 ≫ 视觉 |
| doubao-2.0-lite | 50.0% | 46.7% | 接近持平 |
| doubao-2.0-code | 42.5% | 0.8% | 文本 ≫ 视觉 |
| minimax-m3 | 34.2% | 1.7% | 文本 ≫ 视觉 |
| kimi-k2-7 | 31.7% | 17.5% | 文本 > 视觉 |
| doubao-2.0-pro | 28.8% | 0.9% | 文本 ≫ 视觉 |

> **核心发现（6 模型一致）**：所有 6 个模型，纯文本直注 bypass 都高于真视觉 bypass。差异在多数模型上统计显著（以 glm-4v-flash 为例：文本 CI[79.4, 91.6] vs 视觉 CI[15.2, 29.9]，完全不重叠）。
>
> 含义：**视觉通道反而比纯文本更难攻破**——与"非文本通道普遍更脆弱"的初测直觉相反。这印证了初赛文档 §6.2 的反例结论。doubao-2.0-lite 是唯一接近持平的模型（50% vs 46.7%），说明其文本与视觉防御水平接近，都偏弱。
>
> 数据可靠性：6 模型共 720 样本，error 仅 2 个（doubao-pro 超时），有效样本 718/720。

---

## 四、参照系 ④：评分器自审计（假阳性检测）

**回答的问题**："评分器会不会把无害内容误判为 bypass？"

已有数据：`validation/benign-control-glm-4v-flash.json` —— 30 条无害样本，bypass = **0/30 = 0%**，证明金丝雀评分器对无害内容零误判。

---

## 五、日志格式说明（评委逐条核查用）

每条 `validation/expB-render-*.json` 的 `results[]` 数组，单条样本结构：

| 字段 | 含义 |
|---|---|
| `sample_id` | 样本 ID（对应 h_test_120.jsonl 的 id，可溯源到 payload）|
| `forms.image_plain.verdict` | pass/fail/error |
| `forms.image_plain.bypassed` | 是否被攻破（金丝雀判定）|
| `forms.image_plain.channel_class` | **A/B/C 分类**（A_not_read / B_described / C_executed）|
| `forms.image_plain.perception` | 感知分 0-1（模型是否"读到"隐藏指令）|
| `forms.image_plain.response_excerpt` | 模型原始回复摘要（证据）|
| `forms.image_plain.score_vector` | 多维评分向量 |

**逐条溯源**：任何一条结论数字都能从 `results[]` 里逐条数出来，不是黑箱。

---

## 六、复现种子与可审计性

- 样本集：`validation/h_test_120.jsonl`（120 个平衡有害 payload，固定）
- 随机种子：固定（同种子同 payload 同顺序）
- 完整日志：每次 API 调用的输入/输出/判定/A-B-C 全留存于 `validation/`
- 一行验证：`agent-redteam scan --target zai --model GLM-5.2 --limit 30`（已在干净 venv 验证可跑通）

---

## 七、诚实边界（哪些不是本实验的结论）

- **D2 变异 / D3 多轮**（论文 §4.7）：样本量 n=55/50，单模型，标为初步信号，**不在 expB 主结论采信**
- **κ = 0.55**：moderate agreement，基于截断的 judge 输入，需更大 N + 完整 response 复审
- **scan 命令的 pass/fail 不含 A/B/C**：A/B/C 在 `vision_probe.py` 模块（expB 实验路径），主 CLI 的 scan 是文本套件的快速扫描，两者是不同的实验

---

## 八、参照系完整矩阵（手册要求"排除只是随机运气"）

| 参照层 | 回答的问题 | 数据 | 结论 |
|---|---|---|---|
| ① 平凡基线 | 视觉 bypass 46.7% 是不是模型本身弱？ | `text-baseline-*.json`（6 模型纯文本） | 纯文本全部 > 视觉 → 视觉反而更难攻 |
| ② 载体对照 | 通道效应还是 payload 效应？ | `delivery-text-*.json` + `docpipeline-vision-n120-*.json` | 同 payload 只变载体，隔离通道效应 |
| ③ 跨模型 | 是单家偶发还是共性？ | `expB-render-*.json`（6 模型） | 6 模型一致：能力依赖非均匀盲区 |
| ④ 评分器自审计 | 评分器对无害内容会误判吗？ | `benign-control-glm-4v-flash.json` | 0/30 = 0% 假阳性 |
| ⑤ 随机标签（空模型） | **发现只是随机运气吗？** | `random-label-baseline.json` | 5/6 模型真实 bypass 显著低于随机 50% → 评分器有判别力；doubao-lite（46.7%）落随机 CI 内，此检验不适用（见 benign-control） |

> 第⑤层直接回答手册核心问题"最小参照系是否能排除只是随机运气"：对 6 模型的真实结果用随机标签重评分 1000 次。其中 5 个低 bypass 模型（0.8%–21.7%）的真实 bypass 全部远低于随机中心 50% 的 95%CI 下界，证明评分器对这些模型有判别力、发现不是瞎标出来的。第 6 个模型 doubao-2.0-lite（46.7%）本身接近随机中心，**此 null 检验在原理上无法区分"真被攻破近半"与"评分器瞎标"，故不计入判别力结论**——它的可信度由第④层 benign-control（0% 假阳性）独立支撑。诚实地说：这是 5/6，不是 6/6。

---

## 九、评委交互 demo（5 秒看懂 A/B/C）

```bash
# 无需 API key，从 validation 数据演示（推荐评委首选）
python3 scripts/demo_abc.py

# 有 API key 时，真调模型看实时三通道 A/B/C
python3 scripts/demo_abc.py --mode live
```

demo 展示同一 payload 在三通道（纯文本 / 文档管道 / 真视觉）下的 A/B/C 拆解，让评委直观看到"模型在哪一层失效"。

---

## 十、问题修正证据链（35% 评分维度）

`validation/figure-correction-chain.svg` 是一张时间线图，可视化本项目"问题定义的有效修正"全过程：初测 73% → 发现评分器假阳性 → 校正 47% → 发现 κ bug → 校正 0.55 → 视觉通道重测。每个校正节点标注了触发它的参照系和证据文件。这条"被自我诚实检验逐步推翻"的链条本身就是手册认可的发现信号。

---

## 复赛提交资产清单（评委速查）

| 类别 | 文件 |
|---|---|
| 复现指引 | 本文件（REPRODUCE.md）|
| 核心实验数据 | `validation/expB-render-{6模型}.json` |
| 平凡基线对照 | `validation/text-baseline-{6模型}.json` |
| 随机标签基线 | `validation/random-label-baseline.json` |
| 评分器自审计 | `validation/benign-control-*.json` |
| 问题修正图 | `validation/figure-correction-chain.svg` |
| 评委 demo | `scripts/demo_abc.py` |
| 实验脚本 | `scripts/run_experiment_b.py` / `run_text_baseline_6models.py` / `run_random_label_baseline.py` |
| 种子样本 | `validation/h_test_120.jsonl` |
