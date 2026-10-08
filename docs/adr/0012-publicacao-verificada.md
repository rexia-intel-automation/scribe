# ADR 0012 — Construção e publicação separadas

Data: 2026-10-08. Status: proposta em revisão.

## Contexto

O PRD exige `release.yml`, cinco pacotes de desktop, versões alinhadas e
checksums. Os previews já constroem os pacotes, mas não publicam. Publicar
diretamente de cada job de plataforma exporia uma release parcial antes de
conferir o conjunto e os arquivos efetivamente transportados pelos artifacts.

## Decisão

Usar `tauri-action` fixada em `action-v1.0.0` para builds de leitura, sem
inputs de publicação. Reutilizar a preparação/verificação dos sidecars e
bundles. Um coletor sem dependências externas verifica os cinco arquivos,
metadados e SHA-256, acrescenta somente os documentos públicos selecionados
e gera uma saída nova com manifesto LF/UTF-8 sem BOM.

Tags precisam ter versões JSON exatas e vir de um commit alcançável em
`main` com CI completo aprovado. PRs/dispatch não publicam. Apenas o job de
tag recebe escrita, verifica novamente os inputs, cria uma release nova em
draft e só a publica depois do upload. Nunca altera uma release existente.

## Alternativas e consequências

O upload por plataforma via `tauri-action` é mais curto, mas permite conjunto
parcial e concede escrita aos jobs que compilam dependências. Recompilar no
publisher enfraquece a correspondência com os bytes conferidos. A opção
escolhida repete hashes na fronteira de publicação, sem recompilar.

A validação técnica não substitui revisão independente, instalação limpa,
aceite humano ou assinatura/notarização. A política de criar a tag somente
após esses gates continua obrigatória; não é comprovada pela automação.
Versões internas Rust devem ser mantidas pelo autor da versão; o gate prova
identidade somente entre tag e os três JSONs de app/config/plugin.
