# ADR 0008 — janela nativa e gota

- Data: 2026-10-06.
- Estado: implementado, aguardando catraca da Fase 3.

## Contexto

A Fase 2 passou. As referências locais e argila foram aprovadas pelo humano.
A interface precisa acompanhar o núcleo local sem receber o token do hook e
sem introduzir decisões nesta fase.

## Decisão

Tauri 2.12.1 estável com React, TypeScript e Vite. O comando `get_view` e os
eventos Tauri levam apenas sessões já higienizadas e preferências à janela.
O Rust guarda configuração, SQLite, token e servidor. Capturas recebem revisões
monotônicas, serializadas junto à leitura.
O timestamp permanece apenas como metadado. A UI rejeita revisões anteriores
mesmo quando duas capturas compartilham o mesmo milissegundo. A capability aceita a
janela local `main`; navegação externa e novas janelas são rejeitadas. A ajuda
abre uma URL fixa no navegador do sistema, sem dados de sessão na URL.

Janela transparente sem bordas, sempre no topo, largura lógica 372 px, área
útil menos 32 px. Modo recolhido de 56 px; posição e monitor são persistidos.
Atalho e instância única usam plugins oficiais pelo Rust, sem dar à UI APIs de
arquivo, shell ou configuração de plugins. As preferências validam idioma,
tema, atalho, porta e limites; conflito de porta/atalho permanece visível.
Alterações simultâneas são serializadas. Recolher e reposicionar gravam antes
de mudar o layout; falha de layout restaura arquivo e janela anteriores. As setas
reposicionam a gota focada: esquerda/direita selecionam a borda e cima/baixo movem
16 px lógicos, com clamp à área útil e persistência. Enter/Space continuam abrindo.
Políticas de histórico, poda e recarregamento usam uma transação SQLite;
falhas restauram os arquivos de
configuração. Reinício lê as políticas do banco como fonte autoritativa.
Os dois arquivos JSON e o banco não formam uma transação distribuída: interrupção
entre gravações pode exigir recuperação na abertura, e nenhuma decisão é tomada.

No Windows, o início do arraste usa `WM_NCLBUTTONDOWN` com coordenadas de tela
empacotadas e verifica que o botão esquerdo está pressionado. O Tao 0.37.1
resolvido passa um ponteiro a `POINTS` nesse parâmetro. A documentação Win32
especifica os valores x/y em `lParam`; a adaptação fica restrita ao Windows.
O teste automatizado ainda não demonstrou deslocamento da gota, portanto este
caminho aguarda confirmação funcional e revisão; macOS/Linux usam a API Tauri.

Canvas2D com scheduler compartilhado, 30 desenhos/s nos tamanhos pequenos e
60 no de 96 px. Transições de 450 ms, DPR nativo, pausa em documento oculto e
corte estático com movimento reduzido. O canvas repinta uma única vez se a
resolução/DPR mudar, inclusive no modo reduzido. Interrogação e selo usam glifos, e o
respingo irregular não reutiliza marcas de terceiros. Destaque fica recortado
pelo corpo. Newsreader, Hanken Grotesk e JetBrains Mono são locais com OFL.

O token interno `--gota-ink` permanece `#141413` nos dois temas, separado da
tinta de texto geral. A interrogação e o check branco do tema escuro ficavam
abaixo de 3:1 sobre argila; a tinta escura atende contraste não textual sem
alterar o corpo argila. Essa correção ao uso original dos tokens é necessária
para NFR-08. Testes medem os extremos do gradiente e pixels centrais dos dois
glifos a 24/40/56/96 px em ambos os temas, além da inspeção humana pendente.
Erros do modo recolhido têm indicador visual e anúncio acessível; capturas
novas após recuperação removem avisos locais somente quando o Rust não
reporta erro persistente. A dica de conexão considera hooks após a abertura,
preservando essa informação mesmo quando a sessão recebida deixa de aparecer.

A troca de modo transfere foco DOM ao controle equivalente, sem refocar cada
snapshot nem alterar a ativação nativa do aplicativo externo. O modal mantém
seu gerenciamento de foco; se seu opener foi removido na troca de modo, fechar
restaura o botão Configurações atual.
Ao substituir o conteúdo da confirmação de histórico, o foco acompanha
Cancelar/Apagar histórico. A abertura inicial do modal não altera esse foco,
e atualizações sem troca da confirmação não interrompem a navegação.
Formas estacionárias sem olhos ignoram o
prazo de piscada; transições, órbita e piscadas efetivas continuam desenhando. O job
de auditoria também bloqueia vulnerabilidades npm desde nível baixo, incluindo
dependências de desenvolvimento; não há execução de scripts de instalação.

## Verificação e limites

Testes Rust de transação/validação/origem/gravação privada, Vitest, Playwright e
axe-core. Catálogo reproduzível em `app/ui/test/formas-24px.html`. Observações
do app nativo usam inputs públicos em diretórios de teste isolados; não são
sessões reais do Claude nem decisões humanas. Evidências em `docs/fase-3.md`.
Instaladores e notificações/decisões ficam nas Fases 4 e 6.

Dependências GTK transitivas têm dois avisos RustSec conhecidos; a avaliação
específica está em `docs/dependencias-desktop.md`. Não são omitidos dos logs.

## Fontes

- [IPC Rust](https://v2.tauri.app/develop/calling-rust/).
- [Atalho global](https://v2.tauri.app/plugin/global-shortcut/).
- [Instância única](https://v2.tauri.app/plugin/single-instance/).
- [Bandeja](https://v2.tauri.app/learn/system-tray/).
- [Área útil e escala do monitor](https://v2.tauri.app/reference/javascript/api/namespacewindow/).
- [Permissões de comandos](https://docs.rs/tauri-build/2.7.1/tauri_build/struct.AppManifest.html).
- [Fontes Google com OFL](https://github.com/google/fonts/tree/main/ofl).
- [Coordenadas de WM_NCLBUTTONDOWN](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nclbuttondown).
- [WCAG — contraste não textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
