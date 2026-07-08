# 贡献指南

感谢你有兴趣贡献！这个项目的核心价值在于**攻击测试套件的质量**——每一条测试样本
都是一道安全检查。

## 怎么贡献

### 添加新的攻击样本

最直接的贡献方式。每个套件的 `data.jsonl` 可以扩充：

1. **选一个套件**（11 个可选，见 [套件说明](suites.md)）：
   - `injection` — Prompt 注入（OWASP LLM01）
   - `tool_abuse` — 工具滥用（LLM01）
   - `multi_turn` — 多轮对话攻击（LLM01）
   - `supply_chain` — 供应链攻击（LLM02）
   - `model_dos` — 拒绝服务（LLM04）
   - `excessive_agency` — 过度自主（LLM05）
   - `info_leak` — 信息泄露（LLM06）
   - `insecure_output` — 不安全输出（LLM07）
   - `sensitive_data` — 敏感数据（LLM08）
   - `over_refusal` — 过度拒绝（LLM09）
   - `over_dependency` — 过度依赖（LLM10）
2. **读该套件的 `data.jsonl`**，理解样本格式
3. **编写新样本**——关键是：
   - 真实的攻击场景（不是凭空捏造的"假"攻击）
   - 正确的 `gold` 判定（安全行为应该是 pass）
   - 清晰的 `tags` 和 `owasp` 映射
4. **跑测试确认通过**：`pytest tests/test_core.py -k "suite_loads"`

### 添加新的攻击套件

1. 在 `src/agent_redteam/suites/` 下创建新目录
2. 继承 `Suite` 基类，实现 `build_messages()` 和 `check`（一个 `Check` 实例）
3. 在 `data.jsonl` 里放测试样本
4. `Engine` 会自动发现并注册

更详细的接口说明见 [Python API](api.md) 的"自定义套件"一节。

### 改进判定逻辑

如果你想改进某个 Check 的准确度（比如更智能的泄露检测），修改
`src/agent_redteam/checks/` 下的对应模块，确保 `pytest` 全绿。判定精度是这个项目
最容易失去可信度的地方——过宽的 check 会把真实漏洞算成 pass，过窄的会把模型正确
的回避算成 fail。改动 check 逻辑时，最好在 `validation/` 里跑一次真实样本验证
你的改动方向是对的。

### 前端贡献

前端是 React + TypeScript（19,000+ 行，70+ 组件），位于 `web/`：

- 组件：`web/src/components/`
- 页面：`web/src/pages/`
- 主题/样式：`web/src/theme.ts`（CSS 变量驱动）
- 严格 tsc：`cd web && npx tsc --noEmit --noUnusedLocals --noUnusedParameters`

### 报告 Bug 或建议

用 GitHub Issues。请包含：

- 你测试的模型和参数
- 预期行为 vs 实际行为
- 复现步骤

## 开发环境

```bash
git clone https://github.com/uninhibited-scholar/agent-redteam
cd agent-redteam
pip install -e ".[dev,tui]"
pytest -v   # 应全绿

# 前端开发
cd web && npm install && npm run dev
```

## 代码风格

- Python：PEP 8，行宽 100
- TypeScript：2 空格缩进，strict mode（`--noUnusedLocals --noUnusedParameters`）
- 零核心依赖原则：Python 核心只用 stdlib
