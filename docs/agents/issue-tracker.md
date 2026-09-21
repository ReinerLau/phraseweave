# Issue tracker: GitHub

GitHub Issues are an optional place for requirements, discussion, task notes, and follow-up work. Use the `gh` CLI when an Issue is useful for the current change.

## Common commands

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: `gh issue list`
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

There is no required Issue-to-change mapping or lifecycle label. Associate a change with an Issue when that improves traceability, and otherwise continue without one.
