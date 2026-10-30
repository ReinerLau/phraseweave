## Agent guidance

### Issue tracker

GitHub Issues are available for requirements, notes, and follow-up work. Use the `gh` CLI when an Issue is useful; see `docs/agents/issue-tracker.md`.

### Domain docs

Use the single-context layout with root `CONTEXT.md` and `docs/adr/` when documenting domain decisions. See `docs/agents/domain.md`.

### Manual iteration

The delivery loop is intentionally manual: develop in the primary `dev` checkout by default, run useful checks, commit and push directly to `dev`. Use a feature branch or worktree when isolation is needed or requested; a pull request targeting `dev` is optional. Test the combined changes on `dev`. `main` requires a pull request and must never receive direct pushes. When developing, integrating, or publishing, read `docs/agents/delivery-workflow.md` for the sequence and merge methods.

### Protected release branch

Treat `main` as the production release branch. Only when the user explicitly requests publishing, inspect the integrated changes and prepare or update a `dev` → `main` pull request. Use a merge commit for this release PR so the batch produces one version tag, which publishes the GitHub Packages npm runtime and a GitHub Release. After publishing, synchronize `main` back into the long-lived `dev` with a merge commit and a direct push. Build the desktop launcher installer from an existing merged tag only when the launcher changes; see `docs/desktop.md`.

### Worktree and branch synchronization

The primary checkout uses `dev` for development and integration testing; GitHub's default branch remains `main`. Before creating a worktree or diagnosing branch behavior, inspect `git worktree list` and `git status --short --branch`, and fetch `origin`. Explicitly select `origin/dev` as the base for new feature worktrees rather than relying on the default branch. After merging changes elsewhere, update the relevant clean checkout with a fast-forward and verify it matches the intended remote revision. Preserve other worktrees and their uncommitted changes.
