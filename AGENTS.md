## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout with root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Release workflow

Use one GitHub Issue, one Codex conversation, one branch/worktree, and one pull request per requirement. Create the Issue only after Plan Mode has produced the complete implementation plan and the user says `开始开发`. Follow the natural-language delivery commands and gates in `docs/agents/delivery-workflow.md`.

All feature and fix work lands on `dev` through a pull request. Production releases land on `main` through a separate release pull request; treat both branches as protected, including when operating with administrator access.

Every repository change, including documentation, CI, dependency, and refactor work, must be linked to an Issue. Use the mutually exclusive `status:*` labels documented in the delivery workflow; do not use GitHub Projects for delivery state.

The delivery workflow exposes four natural-language commands:

- `开始开发`: create the planned Issue and begin implementation.
- `发布测试`: run checks, merge the requirement PR into `dev`, deploy `/preview/`, and report the version for acceptance.
- `验收通过`: record the user's preview acceptance and mark the Issue `status:accepted`.
- `正式发布`: verify accepted Issues, merge the release PR into `main`, validate production, and close released Issues.

Follow the detailed steps and completion criteria in `docs/agents/delivery-workflow.md`.

### Worktree and local main synchronization

- A merged pull request updates the remote `main`, not every local checkout or worktree. Never assume the local base worktree is current after merging a PR.
- Before starting a local dev server from `main`, inspect `git worktree list`, `git status --short --branch`, and fetch `origin/main`; if local `main` is behind, fast-forward it before debugging the app.
- After merging a worktree branch, return to the base worktree and verify that `HEAD` matches `origin/main` before diagnosing UI behavior.
