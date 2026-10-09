# GLib 0.18.5: backport de RUSTSEC-2024-0429

Esta cópia vem do pacote oficial [glib 0.18.5](https://crates.io/crates/glib/0.18.5).
SHA-256 do arquivo `.crate` original:
`233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`.
O checksum corresponde ao lockfile antes da substituição pela fonte local.

A única alteração no pacote é o [commit oficial 05dff0e](https://github.com/gtk-rs/gtk-rs-core/commit/05dff0ee696f9bcd8617cd48c4b812d046d440cb):
em `VariantStrIter::impl_get`, `p` é mutável e o argumento de saída de
`g_variant_get_child` recebe `&mut p`. Não há alteração de API, versão ou
dependências GTK/WebKit/Tauri. A branch/tag upstream 0.18.5 consultada ainda
contém o código anterior; não foi identificada uma publicação 0.18 corrigida.

`glib-0.18.5-integrity.json` registra os hashes dos 121 arquivos do pacote.
`node scripts/verification/verify-glib-backport.mjs` confere os arquivos, a
resolução local pelo Cargo, os recursos de licença e a reversão das duas
linhas para o SHA-256 original de `variant_iter.rs`:
`1fd02859333761c45321b32f28b24233446b97d0022a90d3a937ed162585b90e`.
O restante do pacote foi preservado byte a byte. Isso comprova a origem e o
delta; não é uma prova de ausência de todos os defeitos na dependência.

O CI Linux executa os testes upstream de `variant_iter` com otimizações de
release, incluindo percurso pelos dois extremos e esgotamento. Um resultado
verde mostra a execução nessa configuração, sem provar ausência universal
de comportamento indefinido. Revisão e CI atuais são necessários para integrar.

O [advisory](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) classifica
versões anteriores a 0.20 como afetadas e não representa este patch local.
O tratamento específico no audit permanece documentado; ele não concede
nota de segurança nem encerra automaticamente um alerta do GitHub.

Os arquivos `LICENSE` e `COPYRIGHT` do gtk-rs foram preservados e incluídos
como recursos dos instaladores. Ao atualizar para uma versão oficial
compatível corrigida, remover o patch, esta cópia e a exceção correspondente
somente depois de verificar a nova árvore e renovar a auditoria.
