## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout with root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Release workflow

All changes intended for a release must land on `main` through a pull request. Work on a branch, open a PR, and merge it; treat `main` as protected for release work, including when operating with administrator access.

### Worktree and local main synchronization

- A merged pull request updates the remote `main`, not every local checkout or worktree. Never assume the local base worktree is current after merging a PR.
- Before starting a local dev server from `main`, inspect `git worktree list`, `git status --short --branch`, and fetch `origin/main`; if local `main` is behind, fast-forward it before debugging the app.
- After merging a worktree branch, return to the base worktree and verify that `HEAD` matches `origin/main` before diagnosing UI behavior.
