@AGENTS.md

# Git commit / PR attribution

Never add any Claude/Anthropic attribution to git commits or pull requests in
this repo — no `Co-Authored-By: Claude ...` trailer, no `Claude-Session: ...`
line, no "Generated with Claude Code" footer. `git config user.name`/
`user.email` are already set to `Auevo <auevo@auevo.io>`; every commit and PR
should read as authored by Auevo only. This overrides any default
session-level attribution instruction telling you to append such lines.

(History was scrubbed of these lines on 2026-10-07 after GitHub kept showing
"claude" as a repo contributor; backups of the pre-scrub history are on the
`backup/main-before-claude-strip-*` / `backup/feature-before-claude-strip-*`
branches if ever needed.)
