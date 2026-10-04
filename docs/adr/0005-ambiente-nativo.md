# ADR 0005 — ambiente de compilação nativa

- Data: 2026-10-04.
- Estado: verificado no Windows; preparo da Fase 1/2.

## Contexto

O toolchain Rust existia, mas faltava o linker MSVC. A falha inicial permanece
em docs/evidence/native-build.json e não foi convertida em sucesso retroativo.

## Decisão

Instalar Microsoft Build Tools 2022 em D:\BuildTools\2022 com VCTools,
compiladores x86/x64 e Windows SDK 26100. O bootstrapper oficial 17.14.41 teve
assinatura Authenticode válida da Microsoft e SHA256
37bb0fb429d163ecebd272a865d11a37b906d152bef960da2ddb29c2e2fd6eeb.

Fonte de parâmetros e componentes:
[Microsoft](https://learn.microsoft.com/en-us/visualstudio/install/use-command-line-parameters-to-install-visual-studio?view=visualstudio),
[componentes](https://learn.microsoft.com/en-us/visualstudio/install/workload-component-id-vs-build-tools?view=vs-2022).

## Verificação e limites

vswhere detectou a instalação com VC.Tools.x86.x64. rustc --edition 2021 -O
scripts/verification/native-observer.rs compilou com código zero em D:.
A matriz native terminou com código zero nos seis cenários: sem hooks,
saudável, fechado, travado, JSON inválido e HTTP 503. stdout/stderr vazios.
Tempos totais do CLI: 914, 814, 1247, 1154, 660 e 659 ms, respectivamente.
Fonte: docs/evidence/native-observer-1791153656322.json.

O protótipo ignora respostas. Esses tempos incluem inicialização do Claude;
não são latência por hook, p95, parser de decisão ou prova multiplataforma.
A rodada 5 da Fase 0 examinou o conjunto anterior, sem atribuir crédito a esta
prova nova. Não houve reinício do computador.

## Alternativa e consequência

Compilar só em CI manteria o desenvolvimento local bloqueado. A instalação
permite agora construir o cliente final e Tauri; os testes continuam fora do
OneDrive e binários não entram no plugin.
