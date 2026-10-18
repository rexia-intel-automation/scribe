# ADR 0014 — referência de desempenho da beta.2

Data: 2026-10-17. Decisão de produto tomada pelo Codex sob a autorização do
Mohamad de conduzir o projeto e tomar todas as decisões pelas próximas duas
horas. Não é uma aprovação humana de fase nem uma redução dos limites.

## Contexto

O requisito original exige p95 de 200 ms para eventos e 100 ms para decisões,
mas não define hardware. Os testes incluem commits SQLite FULL. As falhas
históricas dos runners foram preservadas; não se presume uma causa pelo fato
de uma execução seguinte passar. No a064, o runner Windows mediu fsync isolado
p95 6 ms e NFR-02 deny 303 ms numa janela posterior. Isso não localiza a causa.
O notebook local tem medições muito menores, que também não explicam o CI.

## Decisão e catracas

- Referência desta beta: notebook Windows 11 do escritório, i5-10300H,
  aproximadamente 16 GB de RAM e SSD. Medição sem llvm-cov, sem compilação ou
  outra carga pesada concorrente. O binário de teste inclui commits FULL,
  transporte HTTP autenticado e verificação das respostas assinadas.
- NFR-02 mantém quatro grupos de 128 amostras (HTTP/Core, allow/deny), pacing
  de 100 ms fora da medição e p95 estritamente abaixo de 100 ms em cada grupo.
  NFR-01 mantém 32 amostras e p95 abaixo de 200 ms no servidor.
- Sem a identificação explícita de runner compartilhado do workflow, os
  asserts permanecem obrigatórios. No CI hospedado os mesmos cenários,
  assinaturas, contagens e deadlines funcionais rodam; a latência é reportada
  como diagnóstico. A alteração de critério do ambiente é explícita.
- A release exige `docs/evidence/reference-performance-windows.json` recente
  (até sete dias), com o hash Git da árvore `app` inteira, hash do binário e
  resultados dos quatro grupos. Fonte alterada, quantil fora do limite,
  contagem incompleta, medição compartilhada ou evidência vencida bloqueiam.
  Mudanças somente em documentos não exigem fingir uma nova medição do app.
- O JSON é evidência do responsável e deve ser conferido na revisão cruzada;
  não é uma atestação de hardware criptográfica. A revisão compara logs
  privados sintéticos, árvore Git e resultados. Nenhuma credencial vai ao JSON.

## Limites

O intervalo não mede clique físico, IPC da janela, foco ou stdout do helper.
Não comprova desempenho de todos os computadores, nem aceites de macOS/Linux.
Os testes funcionais das três plataformas, auditoria, revisão e os cinco
smokes de instalação continuam necessários para publicar. Não se substituem
os ensaios nativos e a auditoria final de segurança por esta evidência.

Nenhuma mudança de `synchronous`, durabilidade, autenticação ou privacidade é
autorizada por este ADR. As falhas anteriores continuam disponíveis no fórum.
