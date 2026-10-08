# Como o Scribe funciona

O plugin do Scribe registra hooks do Claude Code. Um pequeno cliente nativo em Rust envia eventos compatíveis e higienizados ao app local. O app atualiza a lista de sessões e apresenta decisões humanas na janela. Quando a pessoa escolhe uma ação, a resposta local retorna pelo hook ou pelo fluxo de pergunta compatível.

O app não executa modelos, não usa uma chave de API de IA e não oferece controle remoto de sessões. O projeto documenta um serviço local em loopback e ausência de telemetria. Consulte [Segurança](/pt-BR/security) para limites e fronteiras.

Na beta Windows, o plugin e o app são etapas de instalação separadas. Uma sessão nova do Claude Code é necessária após configurar o plugin para que os hooks sejam carregados.
