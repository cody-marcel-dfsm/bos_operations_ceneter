# Claude Code entry point

Read and follow `AGENTS.md`; it governs this repository for every agent harness.

- Implementation, fixes and releases: `.agents/skills/operations-center-implementation/SKILL.md`
  (plain mirror for Claude Code discovery: `.claude/skills/operations-center-implementation/SKILL.md`;
  edit the `.agents` copy first and re-copy it in the same change).
- Planning only: `.agents/skills/operations-center-planning/SKILL.md`.
- Shipping: `.agents/skills/ship-it/SKILL.md`.
- Never load or impersonate `.agents/skills/oracle/SKILL.md`; invoke the Oracle only through
  `npm run oracle:proposal` and `npm run oracle:review`. Under Claude Code, `--engine auto`
  runs the Oracle with the `claude` CLI.
