# 手动迭代流程

本仓库采用 `功能 worktree → PR → dev → 整合测试 → 发布 PR → main → npm 发版` 的手动交付流程。由用户主动发起下一步；只有明确要求发布时，才将整批改动合入 `main`。

## 开发与整合

1. 明确目标，并在需要时先整理简短计划。
2. 检查 `git worktree list` 和 `git status --short --branch`，执行 `git fetch origin`。从最新 `origin/dev` 创建 `codex/` 功能分支及独立 worktree；创建工具的默认基线可能是 `main`，必须明确指定 `origin/dev`。
3. 根据改动风险和当前环境，按需运行检查、测试或构建。
4. 提交工作分支的改动，创建或更新以 `dev` 为目标的 Pull Request，并记录检查结果。功能 PR 默认使用 squash merge。
5. 合并后，在干净的主目录 `dev` 上执行 `git pull --ff-only`，确认与 `origin/dev` 一致，再测试多个功能组合后的行为。整合修复同样通过功能分支和 PR 进入 `dev`。

`dev` 是长期保留的整合分支：必须通过 PR 合并，审批人数为 0，禁止强推和删除，管理员也受规则约束。不要求 CI、线性历史或分支必须最新；按改动风险手动运行检查并在 PR 中记录。进入 `dev` 的改动不会触发版本标签或 npm 发布。

主目录用于 `dev` 整合测试，功能开发使用独立 worktree。已有功能 worktree 保持原状；GitHub 默认分支仍为 `main`，创建 PR 时明确指定目标分支。

## 按批次发布

1. 用户明确要求发布后，获取最新远程状态，核对 `dev` 相对 `main` 的整批改动和整合测试结果，创建或更新 `dev` → `main` 的发布 PR。
2. 确认 `main` 当前提交已有发布标签。若有未发布的第一父链提交，先核查已有发布流程；现有脚本会为每个未打标签的第一父链提交发版。
3. 使用 **merge commit** 合并发布 PR。发布 PR 不使用 squash 或 rebase：merge commit 保留 `dev` 的祖先关系，并让整批功能在 `main` 第一父链上只新增一个提交。
4. 合并后，相对上一发布标签检查 `git rev-list --first-parent --count <上一发布标签>..origin/main`，应仅新增一个待发布提交。确认 GitHub Actions 自动递增一个 patch 版本、创建一个版本标签并发布 GitHub Packages npm 包；检查发布工作流和 GitHub Release 是否成功。
5. 发布成功后，通过 `main` → `dev` PR 使用 **merge commit** 同步历史；即使文件内容一致，也需要同步发布合并提交的祖先关系。保留 `dev`，更新干净的主目录并确认与 `origin/dev` 一致。

桌面启动器安装包按需从已有合并标签手动构建，见 `docs/desktop.md`。发布后回合 `main` 的 PR 也使用 merge commit，不适用功能 PR 默认的 squash merge。

`dev` 与 `main` 的改动均通过 Pull Request 合入；两者都禁止直接推送、强推和删除。Issue、状态标签和验收记录按需使用；若某次工作需要更严格的检查，由用户在当次工作中明确指定。
