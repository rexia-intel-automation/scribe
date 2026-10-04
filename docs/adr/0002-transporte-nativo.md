# ADR 0002 — hooks por comando e cliente nativo

- Estado: adotado pelo humano; prova de protocolo com Node e observador Rust
  concluídas. Cliente de produção e decisões ainda pendentes.
- Data: 2026-10-04.

## Contexto

HTTP exclusivo não cobre SessionStart e imprime erros quando o servidor falha.
O humano pediu a recomendação mais confiável para distribuição. O spike Node
comprovou transporte por comando e silêncio em falhas observadas, mas depender
de Node instalado separadamente adiciona uma condição à instalação do produto.

## Decisão

O humano autorizou seguir com todas as sugestões em 2026-10-04.

Distribuir o cliente de hooks em Rust junto do instalador do app. O plug-in
continua sem binários. Seu comando usará exec form e o caminho documentado do
executável, configurado por `userConfig`, para não depender de Bash ou de PATH.
Esse processo precisa iniciar sem janela, sem carregar Tauri ou SQLite, conectar
apenas a 127.0.0.1 e terminar silenciosamente nas falhas.

Observação comum terá orçamento curto. PermissionRequest terá pré-checagem curta
e espera limitada pela decisão; o servidor deverá encerrar sem decisão em 120 s,
abaixo do limite externo do hook. Falha, desconexão ou resposta inválida nunca
serão convertidas em allow. O parser e os tempos limites reais exigem testes
próprios antes de distribuir.

## Alternativas

- HTTP puro: sem runtime adicional, mas incompatível com os resultados da coleta.
- Node externo: adequado para o spike, adiciona instalação e versão de runtime.
- Bash/curl: diferenças entre plataformas e maior exposição a erros de quoting.

## Consequências

Os instaladores precisam incluir e localizar o cliente nas três plataformas.
CI deve testar esse mesmo executável em falhas e concorrência. O protótipo
`native-observer.rs` somente envia eventos e ignora respostas; não é o cliente
de produção. A compilação inicial falhou; após instalar o linker, a matriz
exploratória passou (ADR 0005). Não sustenta alegações sobre o parser futuro,
desempenho por hook ou decisões. Produção deverá usar biblioteca HTTP mantida
para interpretar respostas e cancelamentos, com dependências fixadas.
