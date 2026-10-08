# ADR 0006 — configuração do plugin

> Atualização de 2026-10-08: a migração para MCP por stdio substitui o contrato
> `port`/`token` descrito na decisão original. O manifesto atual guarda apenas
> `client_path`; `.mcp.json` inicia esse executável com `--mcp`. O candidato do
> plugin é `0.1.1` e exige `attested-stdio-v1`; o plugin beta.1 antigo usa
> HTTP/Bearer e é incompatível. A validação integrada do helper continua
> pendente; a evidência abaixo é histórica e não valida o novo transporte.

- Data: 2026-10-04.
- Estado: implementado e aprovado na rodada 3 da Fase 1.

## Contexto

O plugin é configuração e texto. Seu cliente deve ser o executável incluído no
app, sem Node, shell ou segredo nos argumentos.

## Decisão

userConfig declara somente `client_path` obrigatório. Hooks em exec form
substituem esse caminho diretamente em command; args contém apenas `--hook` e o
evento. O MCP declara transporte stdio e inicia o mesmo executável com `--mcp`.
O helper lê a conexão privada do Scribe e usa o protocolo local autenticado para
encaminhar chamadas ao app. O script configura pelo CLI oficial; não escreve
`settings.json` diretamente nem envia Bearer/token ao Claude Code.

Os arquivos hooks/hooks.json e .mcp.json são carregados pelos locais padrão,
sem declaração duplicada em plugin.json. O comando /scribe fica em commands/;
a skill de contexto tem name scribe-context e user-invocable false, evitando
colisão com o comando. `${CLAUDE_SESSION_ID}` correlaciona ferramentas.

O helper lê `connection.json` do perfil confiável da conta do sistema
operacional. Em Windows, usa `FOLDERID_RoamingAppData/com.rexia.scribe`, obtido
com o token explícito do processo para preservar redirecionamentos legítimos do
Known Folder. Em macOS, deriva o home do UID e usa
`Library/Application Support/com.rexia.scribe`; em Linux, usa o home da conta
do UID em `.config/com.rexia.scribe` e `.local/share/com.rexia.scribe`.
Produção não usa `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `XDG_CONFIG_HOME`
ou `XDG_DATA_HOME` para escolher esse perfil. `SCRIBE_CONNECTION_FILE` e
`SCRIBE_DATA_DIR` são overrides absolutos disponíveis somente quando a feature
explícita `test-fixture` é habilitada; builds debug comuns não a habilitam
automaticamente. As fixtures usam builds release em
`target/fixture`; builds release de produção, sem essa feature, ignoram os
overrides. O artefato com `test-fixture` não é o executável de produção. A configuração
exige uma chave `hook_key` local independente do token interno. O helper stdio
deve manter o transporte autenticado e validar o servidor antes de encaminhar
conteúdo; essa integração requer validação própria e não é coberta pela
evidência histórica abaixo.

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
