# Troubleshooting

## No sessions appear

Confirm that Scribe is open, the plugin setup completed, and Claude Code was restarted into a new interactive session. Managed policies may disable user hooks. Ask IT to check the policy if needed.

## A permission target is hidden or sent to the terminal

This is a privacy fallback when content is ambiguous, redacted, truncated, or unsupported. Answer in the Claude Code terminal; do not treat the missing card action as a defect to work around.

## The setup script fails

Record its stage and exit code. Its output is intentionally withheld so credentials cannot be printed. Do not send tokens, private connection files, or conversation contents.

## A downloaded file is blocked

The beta installer and script are unsigned. Verify SHA-256 values against the matching release checksum and follow your organization’s security policy. Do not bypass an organization block.

## The plugin reports a long-path error

Keep the checkout/cache path short and ask IT to check Git long-path support. The setup script does not change Git settings.
