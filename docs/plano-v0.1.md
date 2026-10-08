# Plano verificável da v0.1

Fonte: prompt.md. Objetivo: Scribe completo, instalável e pronto para teste real
no Claude Code. A v0.2 e a v0.3 ficam fora deste ciclo.

## Decisões humanas

- Revisões continuam até aprovação, mantendo mínimos e contexto independente.
- Repositório: rexia-intel-automation/scribe. Marketplace: rexia-scribe.
- Referências: scribe-conceito.html e ZIPs/vídeos locais. Gota em argila.
- Em 2026-10-07, o humano autorizou instalar a compilação local e adiou a parte
  visual, priorizando o lançamento. Instalação e desenvolvimento das decisões
  podem prosseguir sem esse aceite; a nota G8 e os limites funcionais registrados
  não são convertidos em aprovação. Ver ADR 0009.
- Certificados Windows/Apple e GitHub Pages: pergunta agrupada enviada; respostas
  restantes ainda pendentes. Assinatura é opcional conforme seção 11 do prompt.

## Catracas e evidência necessária

| Fase | Entrega | Verificação |
| --- | --- | --- |
| 0 | Hooks reais, transporte, sessão MCP, FR-22/25 | 46 fixtures rastreáveis; testes de anonimização, falha e revisão independente |
| 1 | Marketplace, plug-in, skill e comando | Validação estrita e instalação local pelo CLI, FR-01 a FR-05 |
| 2 | Servidor axum/tokio, SQLite, estados | Contratos dos 11 eventos, segurança HTTP e persistência; FR-10/11/12 |
| 3 | Tauri, UI, gota, bandeja, atalhos | Dez formas em 24/40/96 px; claro/escuro; teclado/axe; FR-30 a FR-36 |
| 4 | Permissões e perguntas humanas | Permitir, negar, expirar, risco, concorrência e MCP reais; FR-20 a FR-27 |
| 5 | Auditoria de segurança | Modelo de ameaças, dependências e pelo menos dez ataques automatizados; nota C10 |
| 6 | Docs, CI, instaladores e release | Três plataformas, checksums, README em instalação limpa, três sessões reais |

Nenhuma fase será marcada aprovada por um teste que cubra um escopo menor.
Os relatórios anteriores permanecem preservados.

## Cobertura exigida na entrega

- Plug-in: configuração sem binários; cliente Rust incluído no instalador;
  SessionStart e demais dez eventos; comando abre/traz app; skill nunca contorna
  permissões; instalação pelo marketplace com nomes confirmados.
- Servidor: somente 127.0.0.1; Host, Origin, token constante, corpo 1 MB, limite
  de taxa, sem CORS; nenhuma rota de hook aprova; SQLite sem segredo ou ambiente;
  retenção configurável, apagar histórico, reinício sem decisões indevidas.
- Sessões: projeto, ação, duração, origem real quando presente, oito passos
  exibidos/vinte mantidos; sessão encerrada por dez minutos; silêncio de dez
  minutos vira ampulheta; prioridade de estados conforme seção 6.4.
- Decisões: alvo exato higienizado e expandível; decisão só por gesto humano;
  espera de 120 s abaixo do hook; fluxo normal no terminal em falha; perguntas
  2–4 opções, limites 200/40 caracteres e dez minutos; proteção de risco com
  segundo clique; atalhos só com foco; concorrência e cancelamento verificados.
- UI: largura 372 px, posição persistida e área útil; gota recolhida 56 px com
  contador, arrastar/colar à borda; atalho global configurável/conflito; notificação
  abre cartão; bandeja/menu; pt-BR/en; tema automático; movimento reduzido;
  canvas escalado por DPR, dez formas e transições, animação oculta pausada;
  fontes OFL locais; sem abas futuras nem ativos da Anthropic.
- Qualidade: NFR-01/02/03 com latências medidas; NFR-04/05/06 com memória/CPU/FPS;
  NFR-07 persistência; NFR-08 acessibilidade AA; NFR-09 traduções;
  NFR-10 macOS/Windows/Linux; NFR-11 licenças MIT compatíveis/OFL.
- Testes: núcleo de decisões/segurança com cobertura >=85%; Vitest/Testing
  Library/axe; Playwright fluxos e capturas; manual Claude real para três sessões,
  uma aprovação, uma negação, uma expiração e uma pergunta respondida na UI.
- Release: público, main protegida/PR/CI, Issues/Discussions, Dependabot/segredos;
  CI lint/formatação/testes/audits/manifestos/builds; tag v0.1.0; macOS universal,
  Windows MSI, Linux AppImage/deb; SHA256SUMS e tag assinada conforme política;
  documentação VitePress pt-BR/en, README nas duas línguas, licença/governança,
  SECURITY/segurança, ADRs, changelog, GIF 10–15 s, capturas e vídeo fornecido;
  avisos legais no README/site/Sobre; instalação limpa seguindo somente README.

## Estado atual

A Fase 0 foi aprovada na rodada 5: A9 B8 C8 D8 F8 J8. Quatorze testes passaram,
46 fixtures são rastreáveis e o achado baixo R1 está registrado no relatório.
Build Tools foi instalado; observador Rust compilou e passou seis cenários,
com os limites descritos no ADR 0005. A Fase 1 foi aprovada na rodada 3:
A9 B8 C8 D8 E8 F8 J8 K8. Dezoito testes Node e um Rust passaram; CI verde
em três plataformas e auditoria de dependências. A Fase 2 está em implementação
e revisão: vinte e dois testes Rust passaram no PowerShell, com 46 fixtures públicos,
Clippy sem avisos e auditoria sem vulnerabilidades. O p95 local entre evento
HTTP e estado gravado foi 11 ms em 32 amostras; a janela ainda não é medida.
Primeira revisão reprovou cinco casos; correções e regressões passaram, inclusive
o harness independente. A segunda rodada encontrou valor dotenv com espaços,
prazo de concluídas que exigia reinício e Mancha substituída pelo silêncio.
Os três casos foram corrigidos, com regressões para ambos os caminhos de
higienização, redução/ampliação de prazo, falha de banco e capacidade limitada.
A terceira rodada encontrou Authorization concatenado/escapado e caminhos
após redirecionamento. Foi adotada omissão do restante após cabeçalho/chave
sensível e encurtamento junto a operadores; novas regressões e os oito casos
do harness da rodada passaram. A quarta rodada encontrou caminhos junto a
flags de compilador e retenção de sessões/passos vencidos. As correções
incluem limpeza ociosa e transação única para política e histórico; os oito
testes dessa rodada passaram em verificação do construtor. Os quatro
relatórios reprovados estão preservados.
Cobertura de produção local 95,82%, sem código de testes. A quinta rodada
aprovou a Fase 2 em 2026-10-06: A9 B9 C9 D9 E8 F9 I8 J8, 33 regressões
e nove tentativas novas passaram. Ambos os CIs do commit final passaram
em três plataformas. Falhas temporais anteriores do Windows foram registradas
e corrigidas na execução dos testes, mantendo limites e concorrência interna.
A Fase 3 está em verificação, usando as referências locais e a gota em argila.
Janela Windows de produção abre e recebe fixtures públicas pelo núcleo real;
13 testes de UI, quatro Playwright e testes de políticas/origem passaram.
Latência nativa p95 17,46 ms; recursos e avisos GTK estão documentados em
docs/fase-3.md para avaliação independente. A Fase 3 ainda não passou a catraca.
Nenhuma versão está publicada; decisões e instalação limpa seguem pendentes.

Em 2026-10-07, o fluxo local de decisões foi implementado e os executáveis
na visão virtualizada do Codex foram atualizados. Permitir, negar e perguntar passaram com Claude
real no Windows, inclusive expiração de 120 s e resposta tardia após 125 s.
Testes locais e cobertura de 94,41% estão em docs/fase-4.md. Isto não aprova
a Fase 4 completa: notificações, aceite humano, revisão independente e demais
catracas de entrega continuam registradas como pendentes.

Diagnóstico externo em 2026-10-07 encontrou divergência MSIX/AppData: a instalação
real vista pelo Claude Code fora do Codex ainda precisa ser reparada e validada.
Os testes anteriores não comprovam essa instalação externa; ver docs/fase-4.md.
