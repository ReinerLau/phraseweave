# 手动迭代流程

本仓库不强制固定的交付节奏、指令或记录方式。由用户根据当前工作主动发起下一步，下面的顺序只作为参考。

1. 明确目标，并在需要时先整理简短计划。
2. 在工作分支上按计划实现改动。
3. 根据改动风险和当前环境，按需运行检查、测试或构建。
4. 提交工作分支的改动并创建或更新 Pull Request。
5. 通过合并 Pull Request 将改动发布到受保护的 `main` 分支；合并后 GitHub Actions 自动部署 GitHub Pages，并构建桌面安装包作为运行产物。
6. 每个 PR 合并到 `main` 后，GitHub Actions 自动递增 patch 版本、创建版本标签并发布桌面 GitHub Release；如需提升 major 或 minor 版本，见 `docs/desktop.md`。
7. 如需补发已经合并到 `main` 的网页版本，可以在 GitHub Actions 中手动重新运行 Pages 部署 workflow。

Issue、状态标签、Worktree、自动检查和验收记录仍然按需使用；Pull Request 是将新代码发布到 `main` 的必经步骤。若某次工作需要更严格的记录或检查，可以在当次工作中由用户明确指定。
