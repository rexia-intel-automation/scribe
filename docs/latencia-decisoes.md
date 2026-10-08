# Latência da decisão privada até a resposta do hook

O teste permission_choices_deliver_signed_hook_responses_under_100ms_p95,
em app/src-tauri/tests/core.rs, verifica o caminho HTTP real do LocalServer com
banco SQLite temporário, porta efêmera e credenciais públicas de teste. Nenhum
perfil, instalação ou sessão real do Claude Code é usado.

São 32 amostras de permitir e 32 de negar uma PermissionRequest não arriscada
para cada caminho: endpoint HTTP privado e chamada direta a Core::resolve_decision.
Cada amostra autentica o desafio, envia o hook assinado, confirma que existe uma
única decisão pendente na sessão e que o hook ainda espera a resposta. O relógio
começa imediatamente antes do POST privado ou da resolução direta e termina
depois da resposta HTTP completa do hook. O teste exige status 204 da decisão
HTTP, sucesso da resolução direta, status 200 do hook, assinatura HMAC válida
e a escolha correta no JSON.

A interface desktop usa invoke do Tauri, não o endpoint HTTP privado. Ambos
os caminhos exercitam a mesma primitiva Core::resolve_decision usada pelo
comando Tauri. O teste direto exclui IPC, verificação de foco e retorno da view;
não deve ser apresentado como medição da interface desktop.

O p95 usa a posição 30 das 32 durações ordenadas e deve ser estritamente menor
que 100 ms para cada escolha e caminho, conforme NFR-02 de prompt.md. O log mostra
o máximo e a quantidade de amostras que atingem ou excedem 100 ms. A pausa de
100 ms entre amostras fica fora da medição e preserva a quota real do servidor.
Não há exceção por plataforma ou aumento do limite para runners lentos.

O intervalo inclui transporte localhost, scheduling, persistência, serialização
e assinatura. É um limite superior conservador do processamento interno desse
caminho sintético, e não uma medição isolada do servidor. Uma falha pode incluir
custos do ambiente externo ao servidor e deve ser investigada sem remover o SLA.

Execução no espelho de runtime da RexIA:

```powershell
cargo test --manifest-path app/src-tauri/Cargo.toml --features desktop --locked --test core permission_choices_deliver_signed_hook_responses_under_100ms_p95 -- --nocapture --test-threads=1
```

O teste integra a suíte normal de core executada pelo CI nas três plataformas.
A execução local Windows dos dois caminhos em 2026-10-08 mediu:

| Caminho | Escolha | Amostras | p95 | Máximo |
| --- | --- | --- | --- | --- |
| HTTP privado | Permitir | 32 | 5 ms | 5 ms |
| HTTP privado | Negar | 32 | 6 ms | 6 ms |
| Core direto | Permitir | 32 | 4 ms | 4 ms |
| Core direto | Negar | 32 | 4 ms | 5 ms |

Nenhuma amostra atingiu 100 ms. Isso não mede clique físico, stdout do helper
nativo, retomada do modelo no harness, perguntas ou aprovação de planos.
Não substitui ensaio humano, aceite de fase nem aceite da release.
