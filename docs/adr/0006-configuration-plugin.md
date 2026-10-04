# ADR 0006 — configuração do plugin

- Data: 2026-10-04.
- Estado: implementado e aprovado na rodada 3 da Fase 1.

## Contexto

O plugin é configuração e texto. Seu cliente deve ser o executável incluído no
app, sem Node, shell ou token nos argumentos. O MCP requer porta e token locais.

## Decisão

userConfig declara client_path (file obrigatório), port (1024–65535, padrão
7717, conforme o PRD) e token (string sensível). Hooks em exec form substituem client_path
diretamente em command; args contém apenas --hook e o evento. MCP usa URL com
127.0.0.1 fixo e token em header. O app orientará/configurará pelo CLI oficial;
não escreverá settings.json diretamente. Tokens passam por stdin em
`claude plugin configure scribe@rexia-scribe --values-stdin`, nunca argv.

Os arquivos hooks/hooks.json e .mcp.json são carregados pelos locais padrão,
sem declaração duplicada em plugin.json. O comando /scribe fica em commands/;
a skill de contexto tem name scribe-context e user-invocable false, evitando
colisão com o comando. `${CLAUDE_SESSION_ID}` correlaciona ferramentas.

O cliente lê connection.json em BaseDirs.config_dir()/com.rexia.scribe.
SCRIBE_CONNECTION_FILE permite um caminho absoluto para isolar testes e
instalações portáteis; não contém credenciais nem altera o host fixo.
ureq 3.4.2 sem features padrão, proxy desativado e redirects desativados.
Orçamento de 250 ms para stdin e 250 ms HTTP. Nesta fase descarta toda resposta;
o parser de decisões humano será implementado e validado na Fase 4.

## Evidência e divergência de teste

Ambos os manifestos passaram `claude plugin validate --strict` no CLI 2.1.289.
Instalação local e configuração por stdin passaram. O primeiro ensaio deixou
--setting-sources local, que omite as opções não sensíveis salvas pelo CLI no
escopo user; hooks não carregaram client_path. O ensaio corrigido usa --settings
com apenas as opções salvas deste plugin. Não ativa outros plugins ou servidores
pessoais. Isso é isolamento do teste, não um passo necessário na instalação normal.
O token continua no armazenamento oficial e não é copiado ao override.

CLI recebeu hooks autenticados e fez server/discover, initialize, notifications/
initialized e tools/list automaticamente, sem --plugin-dir ou --mcp-config.
A produção da skill chamou scribe_report com a mesma sessão do hook. A chamada
de pergunta e o comando completo ainda não foram validados neste ensaio:
o CLI depois respondeu limite de uso atingido/reset, com custo do turno zero.
Não atribuir sucesso a esse resultado. A prova da Fase 0 de scribe_ask continua
separada. A instalação sem modelo tem um modo próprio explicitamente rotulado.

## Fontes e alternativas

[Hooks](https://code.claude.com/docs/en/hooks#exec-form-and-shell-form),
[manifestos](https://code.claude.com/docs/en/plugins-reference#user-configuration),
[skills](https://code.claude.com/docs/en/skills#how-a-skill-gets-its-command-name),
[marketplace](https://code.claude.com/docs/en/plugins/marketplace-reference),
[ureq](https://docs.rs/ureq/3.4.2/ureq/).

Shell quoting foi descartado: exec form suporta caminhos com espaços sem
reinterpretar valores. Token nos argumentos foi descartado por exposição na
lista de processos. Node externo adicionaria um requisito de instalação.

## Consequências

O app precisa existir antes de configurar client_path. Os instaladores devem
instalar o helper nos locais indicados pelo comando; app_path aponta para o
app e --show precisa focar uma instância existente. Falhas de abrir retornam
código 1, sem afirmar sucesso. ACL/0600, criação de token, launcher e espera de
decisão ainda dependem das fases de app e segurança. Não existe build final.
