# Referência de eventos e formas

O plugin observa estes eventos de hook do Claude Code: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `SubagentStart`, `SubagentStop`, `Stop` e `SessionEnd`. O app usa os eventos para resumir atividade; ele não exibe transcrições brutas.

| Forma | Significado na lista de sessões |
| --- | --- |
| Respingo | Uma sessão acabou de começar. |
| Gota | A sessão está entre turnos ou terminou um turno. |
| Órbita | A sessão está pensando ou usando uma ferramenta. |
| Pena | Uma ferramenta de edição de arquivos está ativa. |
| Interrogação | Uma pergunta ou permissão aguarda resposta. |
| Ampulheta | A sessão está esperando ou ficou dez minutos sem evento. |
| Mancha | Uma ferramenta falhou. |
| Divisão | Um ou mais subagentes estão ativos. |
| Selo | A sessão foi encerrada. |

O app vazio usa um ponto separado. O respingo de uma sessão nova vira uma gota; a forma é um indicador compacto, não uma transcrição nem uma classificação de segurança.

A beta inclui decisões humanas de permissão e o fluxo de perguntas do plugin `scribe_ask`. Perguntas nativas do Claude Code e aprovação de planos ainda dependem de aceite em sessão interativa; consulte o status na [página inicial](/pt-BR/).
