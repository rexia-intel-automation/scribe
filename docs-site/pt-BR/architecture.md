# Arquitetura

```text
Hooks do Claude Code
        │ cliente nativo local
        ▼
Serviço local do Scribe ── estado higienizado ──► janela desktop
        ▲                                             │
        └──────────── decisão humana ─────────────────┘
```

O plugin declara handlers que iniciam o cliente nativo. O cliente se comunica com o app Scribe por um serviço em loopback. O app armazena metadados de sessão higienizados localmente e apresenta atividade e decisões. O serviço autentica suas rotas; o protocolo dos hooks também verifica o outro lado antes de enviar conteúdo.

Respostas de permissão dependem de um gesto explícito. Alvos incompatíveis ou redigidos voltam ao terminal; falhas e timeouts não aprovam ações. Esta descrição não substitui a leitura do código nem das evidências da versão atual.

Consulte [Como funciona](/pt-BR/how-it-works) para o fluxo de uso e [Segurança](/pt-BR/security) para fronteiras e limites.
