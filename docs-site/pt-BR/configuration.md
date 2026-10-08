# Configuração

Na beta Windows publicada, o script configura o plugin para o usuário atual. Execute o `claude.exe` nativo pelo PowerShell com o app Scribe aberto. O script usa a conexão existente do app e não pede para copiar um token. Ele não edita `settings.json` diretamente nem gera um token novo para o app.

Após configurar, feche o Claude Code e inicie uma sessão interativa nova. As configurações do Scribe incluem idioma, tema, atalho global, notificações, retenção do histórico e porta da conexão local. Altere-as pela tela Configurações do app.

As notificações nativas ainda estão em revisão e não fazem parte da beta publicada. A presença dessa preferência não significa que esta beta entregue notificações do sistema.

Não cole o conteúdo de `%APPDATA%\com.rexia.scribe` em chamados ou conversas. Políticas gerenciadas do Claude Code, como `disableAllHooks` ou `allowManagedHooksOnly`, podem impedir hooks instalados pelo usuário; peça ao administrador para verificar a política da organização em vez de alterá-la por conta própria.
