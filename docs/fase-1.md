# Fase 1 — plugin instalável

Estado: em implementação, revisão ainda pendente. A Fase 0 passou na rodada 5.

## Entregas

Marketplace rexia-scribe, plugin scribe 0.1.0, onze hooks exec form, MCP HTTP
local, skill de contexto e comando /scribe. Cliente observador Rust separado
do plugin, usando biblioteca HTTP mantida. Licença MIT com titular do prompt.

## Verificar fora do OneDrive

```powershell
claude plugin validate --strict .
claude plugin validate --strict plugins/scribe
cargo fmt --manifest-path app/hook-client/Cargo.toml --check
cargo clippy --manifest-path app/hook-client/Cargo.toml --locked -- -D warnings
cargo test --manifest-path app/hook-client/Cargo.toml --locked
cargo build --release --manifest-path app/hook-client/Cargo.toml --locked
node --test scripts/verification/*.test.mjs
node scripts/verification/plugin-install.mjs --installation-only
```

O teste registra marketplace e instala o plugin no escopo local de um workspace
temporário dentro de .verification. Configura somente por CLI, usa caminho do
helper com espaços e token artificial aleatório. Limpa instalação e registro
pelos comandos oficiais. Recusa sobrescrever marketplace já registrado.

O modo completo, sem --installation-only, usa a assinatura autenticada para
testes públicos de skill/MCP/comando, com limites de custo e de tempo. O CLI
atingiu limite de uso nos últimos ensaios; os resultados não são aprovados.
Não repetir o teste de modelo até o reset ou a conta voltar a responder.

Testes do mesmo helper de release cobrem onze eventos, app fechado/travado,
JSON inválido/HTTP 503, resposta allow ignorada, redirects/proxies, caminhos com
espaços, input excessivo/malformado e stdin que não encerra. Nenhuma saída
é produzida pelo hook. Isso não comprova decisão humana nem instalador final.

## Instalação normal planejada

1. Instalar/abrir o app desktop (ainda não disponível).
2. `claude plugin marketplace add rexia-intel-automation/scribe`.
3. `claude plugin install scribe@rexia-scribe`.
4. Configurar caminho/porta/token pela interface oficial ou pelo fluxo de stdin
   fornecido pelo app; nunca colocar token na linha de comando.
5. Abrir uma sessão nova e usar `/scribe` (`/scribe:scribe` se houver colisão).

[O repositório público](https://github.com/rexia-intel-automation/scribe) e
[o PR em rascunho](https://github.com/rexia-intel-automation/scribe/pull/1)
existem. CI passou nas três plataformas para c9af439. O site e a release do app
ainda não estão disponíveis. FR-04 com app real, decisões e builds de
macOS/Linux aguardam as fases correspondentes; permanecem no plano v0.1.

A rodada 1 reprovou C7/E7/K7 por ausência de auditoria/Dependabot e falha na
limpeza do teste. As três correções incluem CI cargo audit, Dependabot cargo e
actions, tentativas de limpeza independentes com erros registrados e regressão
do finally original. A nova rodada deverá conferir o commit corrigido e seu CI.
