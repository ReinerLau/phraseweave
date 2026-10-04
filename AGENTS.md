## Agent guidance

### Issue tracker

GitHub Issues are available for requirements, notes, and follow-up work. Use the `gh` CLI when an Issue is useful; see `docs/agents/issue-tracker.md`.

### Domain docs

Use the single-context layout with root `CONTEXT.md` and `docs/adr/` when documenting domain decisions. See `docs/agents/domain.md`.

### Manual iteration

The delivery loop is intentionally manual: plan, implement, run any useful checks, commit on a working branch, open a pull request, merge it into `main`, and deploy when requested. `main` is a protected branch: code destined for release must reach it through a pull request, and agents must never push directly to `main`. When the user asks to publish, inspect the current branch and changes first, then prepare or update the pull request; do not attempt a direct push to `main`. See `docs/agents/delivery-workflow.md` for the lightweight sequence.

### Protected release branch

Treat `main` as the production release branch and protected branch. Merging a pull request into `main` creates a version tag; the tag publishes the GitHub Packages npm runtime and a GitHub Release. Build the desktop launcher installer from an existing merged tag only when the launcher changes; see `docs/desktop.md`. Re-running a workflow for a previously merged revision does not replace the pull request requirement for new code.

### Worktree and local main synchronization

When working with multiple worktrees or diagnosing behavior from `main`, inspect `git worktree list`, `git status --short --branch`, and fetch `origin/main` before relying on a local base checkout. After merging changes elsewhere, verify that the checkout being used matches the intended remote revision.
