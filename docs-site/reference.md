# Event and form reference

The plugin observes these Claude Code hook events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `SubagentStart`, `SubagentStop`, `Stop`, and `SessionEnd`. The app uses them to summarize activity; it does not display raw transcripts.

| Form | Meaning in the session list |
| --- | --- |
| Splash | A session has just started. |
| Drop | The session is between turns or has finished a turn. |
| Orbit | The session is thinking or using a tool. |
| Quill | A file-editing tool is active. |
| Question | A question or permission is waiting. |
| Hourglass | The session is waiting or has had no event for ten minutes. |
| Blot | A tool failed. |
| Split | One or more subagents are active. |
| Seal | The session ended. |

The empty app uses a separate dot. A new session’s splash transitions to a drop; state is a compact status cue, not a transcript or a safety rating.

The beta includes human permission decisions and the `scribe_ask` plugin question flow. Native Claude Code questions and plan approval remain subject to interactive-session acceptance; see the beta status on the [home page](/).
