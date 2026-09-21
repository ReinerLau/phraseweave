## Agent guidance

### Issue tracker

GitHub Issues are available for requirements, notes, and follow-up work. Use the `gh` CLI when an Issue is useful; see `docs/agents/issue-tracker.md`.

### Domain docs

Use the single-context layout with root `CONTEXT.md` and `docs/adr/` when documenting domain decisions. See `docs/agents/domain.md`.

### Manual iteration

The delivery loop is intentionally manual: plan, implement, run any useful checks, commit or merge as appropriate, and deploy when requested. Issues, branches, worktrees, pull requests, checks, and releases are optional tools. See `docs/agents/delivery-workflow.md` for the lightweight sequence.

### Worktree and local main synchronization

When working with multiple worktrees or diagnosing behavior from `main`, inspect `git worktree list`, `git status --short --branch`, and fetch `origin/main` before relying on a local base checkout. After merging changes elsewhere, verify that the checkout being used matches the intended remote revision.
