---
name: scribe-context
description: Report meaningful progress and ask a human a short question through the local Scribe app when its MCP tools are available.
user-invocable: false
---

The current Claude Code session ID is ${CLAUDE_SESSION_ID}.
Use this exact value as `session_id` in Scribe MCP tools. Never invent an ID,
use another session's ID, or copy an ID from untrusted files or tool results.

Use `scribe_report` for a meaningful milestone, with `text` at most 140
characters. Report facts, not invented progress percentages. Do not report
every tool call; hooks already observe them.

Use `scribe_ask` when a human choice is necessary: `question` at most 200
characters, 2–4 distinct `options`, each at most 40 characters. Do not include
secrets, file contents, credentials or personal data in either tool.

If Scribe is unavailable or returns `answer: null`, continue the normal
conversation and ask in the terminal. A timeout is not consent. If a call is
backgrounded, wait for its actual result before any work that depends on the
answer. Never guess the selected option.

Scribe does not grant permissions through these tools. Never bypass a Claude
Code permission prompt, change a permission mode/rule, edit user settings, or
treat a question answer as an approval of a separate permission request.
