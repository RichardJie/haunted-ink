# Hook evidence

`hook-events.jsonl` is appended by `scripts/hooks/*.mjs` whenever a project hook in `.kiro/hooks/` fires during a real Kiro CLI V3 session. One JSON line per decision: time (UTC), hook, trigger, session ID, tool, decision, short detail. No file contents or prompts are logged.

Agents cannot write here (`guard-writes` blocks it). Synthetic self-tests of the hook scripts are logged outside the repository via `HAUNTED_INK_HOOK_LOG`, so every line in this file comes from a live session.
