# 迭代交付流程

GitHub Issue 和 Pull Request 是持续交付的正式记录。Codex 对话是工作会话，不能替代 Issue。

## 需求进入与规划

1. 在 Plan Mode 中讨论并澄清需求。
2. 生成完整实现计划，至少覆盖目标、用户可见的成功标准、范围、接口、数据流、边界情况、测试、发布方式和假设。
3. 只有在用户说“开始开发”后，才创建 GitHub Issue，并把完整计划写入 Issue 正文。
4. Issue 始终只保留一个流程状态标签：`status:in-progress`、`status:waiting-acceptance`、`status:accepted`、`status:released` 或 `status:blocked`。流程状态标签与 triage 标签分开使用。

所有改动都必须关联一个 Issue，包括产品功能、缺陷修复、文档、CI、依赖和重构。实现细节发生变化时，更新原 Issue 并记录原因；如果目标、范围或验收标准发生变化，暂停开发并重新确认计划。

## 交付隔离

每个 Issue 对应一个 Codex 对话、一个隔离 Worktree、一个分支和一个 Pull Request。相互独立的 Issue 可以并行推进；有依赖关系或修改同一区域的 Issue 必须在计划中明确顺序。

功能和修复分支统一以 `dev` 为目标分支。PR 正文必须包含 `Refs #<issue>`，不能使用 `Closes`，因为验收和正式发布在之后进行。只有用户说“发布测试”时才创建 PR，不提前创建 Draft PR。

## “发布测试”

把“发布测试”视为一个完整的交付指令：

1. 运行相关的本地检查。
2. 推送需求分支，并使用仓库 PR 模板创建一个指向 `dev` 的 PR。
3. 等待 `format`、`typecheck`、`unit-tests`、`static-build` 和 `smoke-test` 全部通过。检查失败时修复问题；只有确认是偶发基础设施问题时才重跑同一检查，并始终保留分支保护。
4. 阅读 Codex Review，并向用户总结发现。Review 建议不阻塞合并；CI 和分支保护是合并门禁。
5. 使用 squash merge 启用或等待自动合并，并等待 PR 合入。
6. 等待 Pages 工作流部署固定预览地址：`https://reinerlau.github.io/phraseweave/preview/`。
7. 验证预览路径的 smoke 流程，并确认页面显示当前版本，格式为 `preview-YYYY.MM.DD-N`。
8. 将 Issue 状态改为 `status:waiting-acceptance`，并报告预览地址和版本号。

如果 CI、Review、合并或部署失败，原对话和 PR 继续负责处理：诊断、修复、推送并重新等待。外部依赖导致无法推进时，将 Issue 改为 `status:blocked`。

## “验收通过”

只有用户本人可以发出“验收通过”。Codex 写入验收评论，包含授权用户、时间、固定预览地址和可读的预览版本，然后把 Issue 改为 `status:accepted`。验收记录不绑定 Git SHA；页面上显示的版本号是用户可识别的依据。

验收评论使用以下格式：

```text
<!-- phraseweave-acceptance -->
验收人: @github-user
验收时间: 2026-09-21T12:00:00+08:00
预览版本: preview-2026.09.21-1
预览地址: https://reinerlau.github.io/phraseweave/preview/
```

验收通过时不要关闭 Issue。验收只表示允许进入下一次正式发布，不代表已经上线。

## “正式发布”

“正式发布”表示用户授权发布当前 `dev` 内容，不需要再次进行人工版本确认。Codex 在创建发布 PR 前执行机器门禁：

1. 比较 `main..dev`，找出所有已合入的功能或修复 PR。
2. 要求每个 PR 都包含 `Refs #<issue>`，每个关联 Issue 都有 `status:accepted` 和完整验收记录。
3. 如果有改动没有关联 Issue，或存在未验收 Issue，则阻止发布。
4. 从当前 `dev` 快照创建发布分支，并创建指向 `main` 的发布 PR。
5. 等待 `release-readiness`、五项必需 CI 检查和自动合并。发布 PR 使用 merge commit。
6. 等待正式 Pages 部署，并对 `https://reinerlau.github.io/phraseweave/` 执行 smoke 验证。
7. 记录正式版本，关闭已发布的 Issue，并将其改为 `status:released`。

正式环境使用相同的日期序号格式：`production-YYYY.MM.DD-N`。线上出现问题时，必须新建 Issue，继续走 `dev` → 预览 → 验收 → `main` 流程；紧急回滚使用单独且明确记录的 PR。

## 必需检查与故障恢复

受保护的 `dev` 和 `main` 分支都要求以下检查：`format`、`typecheck`、`unit-tests`、`static-build`、`smoke-test`。`main` 还额外要求 `release-readiness`。

Codex Review 是建议性检查，负责解释风险和后续工作，但不能替代 CI、用户验收或分支保护。
