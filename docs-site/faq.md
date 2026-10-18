# FAQ

## Does Scribe use an AI model or API key?

No. It observes hooks and returns supported human decisions; it does not call a model or use the user’s AI login.

## Does it send session data to the cloud?

The documented app design uses loopback communication and no telemetry. Scribe does not synchronize sessions between machines.

## Which version is available?

Check [Releases](https://github.com/rexia-intel-automation/scribe/releases) for available packages. This source targets experimental beta.2 with plugin0.1.1 stdio; beta.1 is the incompatible legacy HTTP pairing. Neither is an accepted final release.

## Are native questions and plan approval accepted?

Not yet. They require a fresh interactive Claude Code session and human acceptance. The non-interactive `claude -p` path does not validate interactive AskUserQuestion behavior.

## Does Scribe replace permission rules or a sandbox?

No. Use Claude Code’s permission controls and your organization’s policies. Scribe is a companion UI, not a security boundary against software running as the same user.
