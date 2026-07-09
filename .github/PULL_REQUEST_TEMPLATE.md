## 变更说明
<!-- 这 PR 做了什么？ -->

## 变更类型
- [ ] 新攻击样本（扩展现有套件）
- [ ] 新攻击套件
- [ ] 判定逻辑改进
- [ ] Bug 修复
- [ ] UI/Dashboard 改进
- [ ] 文档

## 安全影响
- [ ] 不涉及 secrets、报告渲染、GitHub Action、模型输出判定或 dashboard API
- [ ] 已检查不会在 CLI/log/report/HTML/JSON 中泄露 API key 或 private prompt
- [ ] 如果修改了 check/suite，已说明 false positive / false negative 风险

## 测试
<!-- 确认测试通过 -->
- [ ] `pytest -q`
- [ ] `agent-redteam doctor`
- [ ] 如果改了前端：`npm --prefix web run typecheck`
- [ ] 如果改了前端：`npm --prefix web run typecheck:strict`
- [ ] 如果改了前端：`npm --prefix web run build`

## 相关 Issue
<!-- fixes #123 -->
