# FAQ

## Does Scribe use an AI model or API key?

No. It observes hooks and returns supported human decisions; it does not call a model or use the user’s AI login.

## Does it send session data to the cloud?

The documented app design uses loopback communication and no telemetry. Scribe does not synchronize sessions between machines.

## Which version is available?

`v0.1.0-beta.1` is a Windows prerelease for IT evaluation. It is not the final release. Other changes in open pull requests are not included in that beta.

## Are native questions and plan approval accepted?

Not yet. They require a fresh interactive Claude Code session and human acceptance. The non-interactive `claude -p` path does not validate interactive AskUserQuestion behavior.

## Does Scribe replace permission rules or a sandbox?

No. Use Claude Code’s permission controls and your organization’s policies. Scribe is a companion UI, not a security boundary against software running as the same user.
