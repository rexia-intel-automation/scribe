# Security policy

Scribe is currently a pre-release desktop application. There is no supported
stable release yet. Security fixes are developed through reviewed pull requests;
use only the exact build and checksums associated with the tested revision.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/rexia-intel-automation/scribe/security/advisories/new).
It is enabled for this repository. Include the affected commit or installer
hash, operating system, reproduction steps, expected behavior and impact.
Use synthetic data. Do not attach connection.json, credentials, private session
transcripts or databases. Public issues are suitable for ordinary bugs, but
should not contain an unpatched security exploit or secret.

There is no guaranteed response time or paid bug bounty. The maintainers will
review the report, coordinate a fix and agree on disclosure before publishing
sensitive details.

## Trust boundaries

Scribe listens only on IPv4 loopback. Hooks use a separate private HMAC key;
MCP uses Bearer authentication; decision routes additionally require an
ephemeral UI credential retained inside Rust. The webview receives safe
display data. It does not receive these keys or arbitrary filesystem access.

Processes running as the same OS user, administrators and compromised harnesses
may read user-owned secrets or control the application. Scribe does not provide
an isolation boundary against those attackers. MCP callers sharing a Bearer
credential also share authority to name sessions; that identity is not
cryptographically isolated. A plan approval can return Claude Code to its
previous permission mode.

See the [threat model and regression inventory](docs/seguranca.md) and
[desktop dependency exceptions](docs/dependencias-desktop.md). A green audit
with documented exceptions does not mean every dependency advisory is fixed.

## Relatar em português

Envie vulnerabilidades pelo mesmo formulário privado. Informe o commit ou hash
do instalador, sistema operacional, reprodução e impacto, usando dados fictícios.
Não envie tokens, connection.json, banco ou conversas privadas. O Scribe está
em pré-lançamento; não há versão estável suportada nem prazo de resposta ou
recompensa garantidos. O modelo de ameaças e os limites estão nos documentos
vinculados acima.
