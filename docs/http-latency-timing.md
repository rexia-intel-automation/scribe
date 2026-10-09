# Diagnóstico temporário das etapas de latência HTTP

Este lote é um instrumento de investigação, não um candidato a release ou uma
correção comprovada. Base: PR52 `fccc11a94b03932b331cfddde0492c77627a91b1`.
A PR46 e seus resultados anteriores ficam preservados.

## Pergunta nova

Na PR52, os dois jobs Linux falharam no teste existente de 32 eventos HTTP:
p95 POST de 654 ms e 243 ms, respectivamente (gate total de 200 ms). O Core
direto, medido depois, deu 1 ms no primeiro job e 364 ms no segundo. Os quatro
grupos NFR02 posteriores passaram nesses jobs. Portanto, Core rápido em outro
momento não comprova uma causa de rede nem exclui uma rajada de armazenamento.
No Windows, falhas anteriores de NFR02 também continuam registradas.

## Medidas

A feature `decision-timing` só compila com debug assertions. Um build release
com ela deve falhar; builds normais não emitem os novos logs. Os registros
contêm somente rótulos fixos e durações numéricas em microssegundos:

- `SCRIBE_STORAGE_TIMING`: serialização e execução SQLite separadas, para
  sessão e decisão; no Windows, CPU da própria thread durante a execução SQL.
- `SCRIBE_HOOK_CORE_TIMING`: espera pelo mutex, prune e tempo até/depois de save.
  `before_save_us`/`after_save_us` são cumulativos a partir do início de prune.
- `SCRIBE_DECISION_CORE_TIMING`: espera pelo mutex na resolução.
- `SCRIBE_HTTP_DISPATCH_TIMING`: fila de spawn_blocking e execução do Core.
- `SCRIBE_HTTP_JOIN_TIMING`: despacho até retorno do await; inclui o log emitido
  dentro do worker e sua passagem de volta ao runtime.
- `SCRIBE_HTTP_HOOK_TIMING`: defesa/coleta/autenticação, handler e prova de
  resposta, antes da escrita efetiva da resposta pelo Hyper.
- `SCRIBE_HTTP_CLIENT_TIMING`: conexão, montagem/escrita e leitura até EOF
  no helper dos testes, somente POST; não registra caminho, corpo ou headers.

Não há identificadores para correlação entre requisições concorrentes. Na
sequência isolada de SessionStart do teste phase2, os registros seguem cada
requisição serial; no restante da suite, a ordem de logs por si só não prova
correlação. Nenhum registro imprime conteúdo de eventos, IDs ou credenciais.

## Escopo e limites

O workflow usa Windows e Linux e executa a suite Core existente completa,
serializada como no CI normal. Mantém os 32 eventos phase2, as 512 amostras
NFR02, seus quatro grupos, pacing, gates 200/100 ms, FULL e secure_delete.
Não adiciona carga nem repete uma execução para buscar verde. Resultados
falhos e passes são evidência; um pass instrumentado não apaga falhas anteriores.

Os logs podem perturbar tempos; CPU baixa com wall time alta não distingue
I/O, fsync, preempção ou antivírus. O cliente raw dos testes usa conexões novas
e Connection: close, enquanto o helper nativo reusa a conexão do challenge.
Read-to-EOF inclui entrega da resposta e fechamento, sem separar primeiro
byte de EOF. Isto delimita a observação, não demonstra um defeito de TCP.

Não executar contra instalações/perfis reais, publicar binários deste lote,
alterar o plugin do espelho de build ou integrar a instrumentação ao produto.
Os demais gates de revisão, ensaio humano e instalação continuam pendentes.
