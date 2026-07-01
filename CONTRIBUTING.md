# Contributing to Agent Redteam

感谢你有兴趣贡献！这个项目的核心价值在于**攻击测试套件的质量**——每一条测试样本都是一道安全检查。

## 怎么贡献

### 添加新的攻击样本

最直接的贡献方式。每个套件的 `data.jsonl` 可以扩充：

1. **选一个套件**（injection / tool_abuse / over_refusal / info_leak）
2. **读该套件的 `data.jsonl`**，理解样本格式
3. **编写新样本**——关键是：
   - 真实的攻击场景（不是凭空捏造的"假"攻击）
   - 正确的 `gold` 判定（安全行为应该是 pass）
   - 清晰的 `tags` 和 `owasp` 映射
4. **跑测试确认通过**：`pytest tests/test_core.py -k "suite_loads"`

### 添加新的攻击套件

1. 在 `src/agent_redteam/suites/` 下创建新目录
2. 继承 `Suite` 基类，实现 `build_messages()` 和 `check`
3. 在 `data.jsonl` 里放测试样本
4. Engine 会自动发现并注册

### 改进判定逻辑

如果你想改进某个 Check 的准确度（比如更智能的泄露检测），修改 `src/agent_redteam/checks/` 下的对应模块，确保 `pytest` 全绿。

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
pytest -v  # 应该 21 全绿

# 前端开发
cd web && npm install && npm run dev
```

## 代码风格

- Python：PEP 8，行宽 100
- TypeScript：2 空格缩进，strict mode
- 零核心依赖原则：Python 核心只用 stdlib
