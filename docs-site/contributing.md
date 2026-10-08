# Contributing

Issues and pull requests are welcome. Before proposing a change, describe the user problem and its expected behavior. Keep changes focused and include tests or reproduction steps appropriate to the change.

For security issues, follow the private reporting instructions in the repository’s [security policy](https://github.com/rexia-intel-automation/scribe/blob/main/SECURITY.md) rather than posting exploit details publicly.

Do not include credentials, private session transcripts, app profile files, or unreviewed screenshots in issues, pull requests, or test fixtures. Changes to the site should build locally with `npm ci` and `npm run build` from `docs-site/`.

Scribe is an independent open-source project by RexIA, not affiliated with Anthropic. Claude and Claude Code are trademarks of Anthropic.

The site pins stable VitePress 1.6.4 and overrides its Vite dependency to 6.4.4 to address the vulnerabilities found in the Vite 5 dependency tree. Keep the lockfile, run `npm audit --audit-level=low`, and build all pages when changing these versions. The override was checked with the complete bilingual static build; revisit it when updating VitePress.
