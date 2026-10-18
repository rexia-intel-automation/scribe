# Dependências do desktop — avaliação antes da Fase 3

Data: 2026-10-06. Tauri 2.12.1 estável, lockfile versionado. Esta avaliação
não aprova a catraca de segurança da Fase 5.

`cargo audit` encontrou dois avisos na árvore GTK do Linux:

| Aviso | Dependência | Alcance verificado | Tratamento |
| --- | --- | --- | --- |
| [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370/) | proc-macro-error 1.0.4 | glib-macros/gtk3-macros; expansão de macros na compilação, não código do servidor | Exceção específica para ausência de manutenção; auditar novamente na Fase 5 |
| [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429/) | glib 0.18.5 | `VariantStrIter::impl_get`; SDK GTK transitivo no Linux | Backport local das duas linhas oficiais; origem conferida na preparação, consistência com o manifesto e delta verificados pelo CI; revisão atual ainda necessária |

O segundo aviso descreve uma referência imutável passada como saída mutável
para C e possível dereferência nula. Versões glib >=0.20 corrigem o problema,
mas não são compatíveis com a árvore GTK3 da versão estável do Tauri. A análise
de alcance é uma inferência estática, não uma prova formal de ausência de risco.
A fonte resolvida nesta branch inclui o backport oficial em
`vendor/glib-0.18.5`, mantendo a API 0.18. O [registro do backport](../vendor/README.md)
identifica a origem, o delta e a verificação de integridade. Essa correção de
fonte não equivale à atualização para uma versão oficial 0.20 nem à aprovação
da Fase 5; a classificação baseada em versão continua documentada.

Reprodução: `cargo tree --features desktop --target x86_64-unknown-linux-gnu -i
glib` e `-i proc-macro-error`; consultar os fontes efetivamente resolvidos no
vendor por `rg 'array_iter_str\('`. Os únicos resultados encontrados foram
a definição, documentação e testes do próprio glib. Scribe não cria nem itera
arrays Variant dessa API. No Windows estes crates GTK não entram no binário.

O CI mantém `--deny warnings`; estes dois IDs têm exceção na auditoria do
desktop, com esta justificativa pública. A auditoria do cliente de hooks não
tem exceções. Novos avisos, vulnerabilidades e npm audit continuam bloqueando.
Os relatórios completos preservam ambos os avisos. A revisão independente deve
avaliar esta conclusão e o risco residual antes da catraca; atualizar os crates
ou a estratégia de backend quando houver versão compatível corrigida.

## Consolidação D-Bus — decisão temporária de 2026-10-17

RustSec publicou em 17/10 os avisos de manutenção
[RUSTSEC-2026-0370](https://rustsec.org/advisories/RUSTSEC-2026-0370.html),
[0371](https://rustsec.org/advisories/RUSTSEC-2026-0371.html) e
[0372](https://rustsec.org/advisories/RUSTSEC-2026-0372.html). Eles registram a
incorporação de zvariant, zbus_names e zvariant_derive ao zbus 6, sem indicar
uma vulnerabilidade corrigida nessas versões. Na verificação desta rodada,
[Tauri v2](https://github.com/tauri-apps/plugins-workspace/blob/v2/Cargo.toml)
ainda exige zbus 5.9 e
[notify-rust](https://github.com/hoodie/notify-rust/blob/v4.18.2/Cargo.toml)
exige zbus 5. Mudar somente o lockfile para 6 não satisfaz essas dependências.

Na condução autônoma autorizada pelo Mohamad, a decisão é manter as APIs
estáveis e aceitar temporariamente apenas esses avisos informativos para
zvariant 5.15.0, zbus_names 4.3.4 e zvariant_derive 5.15.0. A política vence
em **2026-11-01 00:00 UTC**, sem renovação automática, e precisa de revisão
independente antes do merge. Não equivale a uma aprovação de segurança final.

`audit-desktop-dependencies.mjs` executa cargo audit com `--deny warnings`,
mantendo somente os dois ignores históricos acima. Ele verifica o relatório
JSON e só aceita os três avisos se ID, pacote, versão e classificação
`unmaintained` forem exatos, sem CVSS ou alias CVE. Vulnerabilidades, novos
avisos, classificações diferentes, filtros adicionais, falhas da ferramenta
e exceções vencidas bloqueiam. A release também confere o vencimento antes
da validação da tag; um CI antigo não permite publicar depois dessa data.

Próximo passo: migrar os consumidores para zbus 6 quando houver versões
estáveis compatíveis, remover a política temporária e repetir a auditoria
das três plataformas. Os avisos completos continuam nos logs da rodada.
