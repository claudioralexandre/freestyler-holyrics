# Tasks: Painel de configuração

**Feature**: 004-painel-de-configuracao | **Data**: 2026-07-31

**Entrada**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md),
[research.md](research.md), [contracts/painel-http.md](contracts/painel-http.md),
[quickstart.md](quickstart.md)

> **Revisado após `/speckit-analyze`.** A revisão moveu o **caminho de escrita**
> (validar → mesclar → gravar → despachar) das histórias para a Phase 4. O motivo
> está em [plan.md § Ordem de implementação](plan.md#ordem-de-implementação):
> salvar é pré-requisito da US1, não refinamento dela. Sem isso, o MVP terminava
> mostrando estado e sem conseguir gravar um mapeamento.

**Regime de testes**: o Princípio III é **não-negociável** para o núcleo, e esta
feature tem três blocos de núcleo — estado observável, diff de recarga e
mesclagem. Neles, a tarefa de teste vem imediatamente antes da implementação, com
número menor, e o RED é obrigatório. Nos adaptadores (servidor HTTP, gravação,
página) vale a verificação manual registrada, como a constitution permite: as
tarefas de verificação estão nas Phases 10 e 11 e apontam para o
[quickstart](quickstart.md).

**O que é diferente nesta feature**: ela é a primeira a aceitar entrada de fora do
processo. "Degradar sem cair" deixa de ser sobre dependência ausente e passa a ser
sobre entrada hostil — daí a T069 existir sozinha.

## Format: `[ID] [P?] [Story] Descrição com caminho de arquivo`

- **[P]**: pode rodar em paralelo — arquivo distinto, sem dependência pendente
- **[US1]–[US4]**: a que história de usuário a tarefa serve

---

## Phase 1 — Setup

- [X] T001 [P] Acrescentar a seção `painel` a `config/config.example.json`, comentada com os três padrões (`habilitado: true`, `host: "127.0.0.1"`, `port: 3333`) e com a convenção **inversa** à do bloco `freestyler`
  > Na 002, a ausência do bloco desliga a feature. Aqui a ausência **liga**, por FR-004. Quem ler os dois blocos no mesmo arquivo vai supor a mesma regra; o comentário existe para desfazer isso no lugar onde a suposição nasce.
- [X] T002 [P] Criar `tests/fixtures/config-bruta.ts` com um JSON de configuração completo contendo (a) uma chave que o esquema **não** conhece, no topo e aninhada, e (b) `coresPorTag` com três entradas em ordem declarada

---

## Phase 2 — Fundação 1: o estado observável fica completo

**⚠️ Bloqueia todas as histórias.** A FR-005 pede sete informações e o
`snapshot()` de hoje entrega três delas. Sem esta fase, a página não tem o que
mostrar — e a Assumption da spec que dizia o contrário está corrigida em
[plan.md § Summary](plan.md#summary).

- [X] T003 Escrever em `tests/unit/state.test.ts` os testes de `corExtraída`: guarda a **última extração bem-sucedida**; sobrevive a um ciclo cuja leitura de cor falhou; permanece `null` enquanto nenhuma extração tiver dado certo. Confirmar RED
- [X] T004 Implementar `corExtraída` em `src/core/state.ts` (FR-005)
- [X] T005 Escrever em `tests/unit/state.test.ts` os testes de `origemDaCor` e `tagDaCor`: descrevem a origem de **`corDeReferência`**, não a da leitura do ciclo. Incluir o caso decisivo — tema mapeado cuja cor ainda **não** foi confirmada pela permanência: a origem deve continuar sendo a da cor que está valendo. Confirmar RED
  > É o erro fácil da feature inteira. Ler a tag do ciclo corrente mostraria a tag certa antes de a cor mapeada valer, e a página estaria mentindo exatamente durante os N ciclos em que o operador está olhando para ela.
- [X] T006 Implementar `origemDaCor` e `tagDaCor` em `src/core/state.ts` (FR-005, FR-008)
- [X] T007 Escrever em `tests/unit/state.test.ts` o teste de descarte conjunto: quando `descartarCor` zera `corDeReferência` por troca de contexto, os três campos novos voltam a `null` junto. Confirmar RED
- [X] T008 Implementar o descarte conjunto em `src/core/state.ts`
- [X] T009 Verificar que `src/core/stability.ts` continua **byte a byte** intocado, e registrar a verificação na descrição do commit desta fase
  > É a garantia estrutural herdada da 003: a cor mapeada não pula nenhuma barreira anti-flicker. Os campos novos são registro, não entrada de decisão.
- [X] T010 [P] Criar `tests/unit/runtime.test.ts` com os testes do snapshot estendido: compõe os campos novos do núcleo; `freestylerDisponível` é `null` quando não há saída DMX configurada e `false` quando há e ela está fora do ar; `gruposConhecidos` vem vazio antes do primeiro inventário. Confirmar RED
  > `null` e `false` pedem ações opostas do operador — "você não configurou" contra "está fora do ar". Colapsá-los repetiria o defeito dos dois erros sob o mesmo HTTP 401 que a verificação da 001 achou no Holyrics.
- [X] T011 Estender `EstadoObservável` e `snapshot()` em `src/service/runtime.ts` com `corExtraída`, `origemDaCor`, `tagDaCor`, `freestylerDisponível`, `grupoResolvido` e `gruposConhecidos`, mais o método interno que o serviço usa para informar o estado da saída
- [X] T012 Expor os grupos conhecidos em `EstadoDaSaída` (`src/core/saida.ts`) e preenchê-los a partir do inventário em `src/service/saida-dmx.ts` (FR-009)
- [X] T013 Ligar o batimento e o estado da saída ao runtime em `src/main.ts`, dentro de `ligarSaídaDMX`
  > Hoje a disponibilidade do Freestyler vive numa closure e nunca sai de lá. Esta tarefa é o que a tira de lá — sem ela, a FR-005 fica com um campo permanentemente `null`.

---

## Phase 3 — Fundação 2: o núcleo da recarga

**⚠️ Bloqueia a Phase 4 e, por ela, todas as histórias.** Puro, sem I/O. É aqui
que a FR-018 e a FR-019 deixam de ser prosa e viram tabela verificável.

- [X] T014 Escrever em `tests/unit/recarga.test.ts` os testes de `camposAlterados`: detecta mudança aninhada; detecta chave que apareceu e chave que sumiu; trata `coresPorTag` como **um** campo (array inteiro); detecta o bloco `freestyler` entrando e saindo; dois objetos iguais devolvem lista vazia. Confirmar RED
- [X] T015 Implementar `camposAlterados` em `src/core/recarga.ts`, operando sobre `Record<string, unknown>` aninhado e devolvendo caminhos em texto
  > Genérico, e não tipado em `Config`, de propósito: `core/` não importa de `adapters/`. Inverter essa seta custaria a propriedade que permite testar a recarga inteira sem abrir um socket.
- [X] T016 Escrever em `tests/unit/recarga.test.ts` os testes de `efeitosDe`, um por linha da [tabela de efeitos](data-model.md#efeitos-de-recarga). Incluir explicitamente: `leitura.regiao` produz **dois** efeitos, um deles `zerar_estado_de_cor`; **nenhum outro caminho** produz `zerar_estado_de_cor` — inclusive `cor.limiarDeltaE`, `cor.ciclosDeConfirmacao` e `coresPorTag`. Confirmar RED
  > É a FR-021 e a FR-021a no mesmo teste, e a FR-021a é a decisão da clarificação de hoje. O teste negativo vale mais que o positivo: quem implementar "campo de cor zera o estado" passa no primeiro e falha aqui.
- [X] T017 Implementar `efeitosDe` e a tabela de caminhos em `src/core/recarga.ts` (FR-018, FR-021, FR-021a)
- [X] T018 Escrever em `tests/unit/recarga.test.ts` o teste da FR-019: lista de campos vazia devolve conjunto de efeitos vazio. Se ficar **verde** já com T017, registrar isso na própria tarefa em vez de forçar um RED artificial
  > Fingir RED onde ele não acontece é pior que não tê-lo. O teste existe porque a FR-019 é requisito, não porque a implementação vá errá-lo.
- [X] T019 Escrever em `tests/unit/recarga.test.ts` o teste do caminho fora da tabela: produz o efeito `desconhecido`, nunca silêncio. Confirmar RED
  > Um campo acrescentado numa feature futura seria aceito pela página, gravado no arquivo e simplesmente não valeria. `desconhecido` é o que transforma isso numa linha de log em vez de num mistério.
- [X] T020 Implementar o tratamento de caminho desconhecido em `src/core/recarga.ts`
- [X] T021 [P] Escrever em `tests/unit/mesclagem.test.ts` os testes de `mesclarConfig`, usando `tests/fixtures/config-bruta.ts`: chave desconhecida de topo sobrevive; chave desconhecida aninhada sobrevive; `coresPorTag` é **substituído**, de modo que remover uma entrada a remove de verdade; a ordem declarada do array sobrevive. Confirmar RED
  > Fundir o array posição a posição faria a remoção não remover nada, e a ordem — que na 003 é a regra de precedência — viraria resultado de uma fusão que ninguém escreveu.
- [X] T022 Implementar `mesclarConfig` em `src/core/mesclagem.ts` (FR-023, FR-025)
- [X] T023 Verificar com `grep -rn "adapters\|service" src/core/` que o núcleo continua sem importar das outras camadas, e registrar o resultado

---

## Phase 4 — Fundação 3: as bordas e o caminho de escrita

**⚠️ Bloqueia todas as histórias.** Servidor, gravação, configuração viva **e o
ciclo completo de submissão**. A tentação é deixar validar/gravar para a história
que exercita cada caso; o resultado seria uma US1 que mostra tudo e não salva
nada.

- [X] T024 Escrever em `tests/unit/config.test.ts` os testes do bloco `painel`: ausente liga a página em `127.0.0.1:3333`; `habilitado: false` desliga; host vazio e porta fora de faixa são recusados; um `painel` parcial recebe os padrões nos campos omitidos. Confirmar RED
- [X] T025 Acrescentar o bloco `painel` ao esquema em `src/adapters/config.ts`, com os padrões de [data-model.md](data-model.md#configuração--bloco-novo-painel) (FR-002, FR-003, FR-003a, FR-004)
- [X] T026 [P] Criar `src/adapters/config-escrita.ts` com a leitura bruta do arquivo e o hash SHA-256 do conteúdo, via `node:crypto` (FR-026)
- [X] T027 Implementar a gravação atômica em `src/adapters/config-escrita.ts`: temporário no **mesmo diretório**, `fsync`, `rename` sobre o original, com retentativa curta em `EPERM`/`EBUSY` (FR-024)
- [X] T028 **Princípio I**: marcar em `src/adapters/config-escrita.ts`, no próprio código, a suposição **não verificada** sobre `rename` atômico sobre arquivo existente no Windows e sobre o `EPERM` de antivírus, apontando [research.md §8](research.md#8-o-que-esta-feature-não-pode-verificar-daqui) e o cenário 30 do quickstart
- [X] T029 [P] Tornar o logger recarregável em `src/adapters/logger.ts`: um objeto estável cujo `pino` interno é substituível, mais a função que aplica nível e destino novos (FR-018)
- [X] T030 **Princípio I**: marcar em `src/adapters/logger.ts` a suposição **não verificada** sobre descartar um transporte em worker do `pino` sob escrita concorrente, apontando [research.md §8](research.md#8-o-que-esta-feature-não-pode-verificar-daqui) e o cenário 31 do quickstart
- [X] T031 Criar `src/adapters/painel/servidor.ts` com `node:http` e o roteador das cinco rotas de [contracts/painel-http.md](contracts/painel-http.md), incluindo o **404 em qualquer outro caminho** — sem servir arquivo do disco e sem listagem (FR-001)
  > A página não resolve caminho nenhum em tempo de execução, então não há travessia de diretório possível. Isso é consequência da decisão da [research §3](research.md#3-onde-vive-o-html), e vale registrar como propriedade, não como sorte.
- [X] T032 Implementar o fluxo SSE de `GET /api/eventos` em `src/adapters/painel/servidor.ts`: conjunto de respostas abertas, `:keepalive` a cada 20 s, encerramento de todas em desligamento e em troca de endereço
- [X] T033 Criar `src/adapters/painel/pagina.ts` com o HTML, o CSS e o JavaScript da página como string exportada, com o esqueleto que abre o `EventSource` e pinta o estado recebido (FR-001)
- [X] T034 Criar `src/service/painel.ts` com a `ConfiguraçãoViva` (atual, bruto, hash, caminho) e a composição do `EstadoDaPágina`, incluindo `discoDivergente` e `sobreposiçõesDeAmbiente` (FR-016a, FR-023, FR-023a)
- [X] T035 Implementar em `src/service/painel.ts` a validação de toda submissão pela **mesma** `validarConfig` de `src/adapters/config.ts`, sem regra própria da interface (FR-011)
- [X] T036 Implementar em `src/service/painel.ts` o caminho de escrita completo do `PUT /api/config`, na ordem do [contrato](contracts/painel-http.md#ordem-das-verificações-e-por-que-ela-é-esta): validar → conferir hash → mesclar sobre o bruto → gravar atomicamente (FR-024, FR-025)
- [X] T037 Garantir em `src/service/painel.ts` que submissão recusada, por qualquer motivo, não toca o arquivo nem a configuração em execução (FR-013)
- [X] T038 Implementar o despacho de efeitos em `src/service/painel.ts`, consumindo o conjunto devolvido por `efeitosDe` — o ponto único por onde **toda** recarga passa (FR-017, FR-018)
  > Único de propósito. Cada história aplica efeitos diferentes, mas nenhuma pode ter caminho próprio de recarga: dois despachos divergiriam, e a FR-019 deixaria de ser verificável num lugar só.
- [X] T039 [P] Escrever em `tests/unit/config.test.ts` o teste que trava a FR-015: `JSON.stringify` da configuração validada **não contém** o token, qualquer que seja o valor de `HOLYRICS_TOKEN`. Confirmar que passa — a garantia é estrutural, e o teste existe para que continue sendo
  > `carregarConfig` devolve `{ config, token, caminho }` como irmãos; o token nunca esteve dentro de `Config`. Este teste não conserta nada hoje — ele impede que alguém "melhore" a estrutura e derrube a FR-015 e a SC-008 sem perceber.
- [X] T040 Montar o painel em `src/main.ts`, respeitando a FR-004a: falha ao subir a página vai para o log e **não** impede o serviço de operar
- [X] T041 Emitir na subida o aviso da FR-003b quando o endereço de escuta não for laço local, dizendo em que endereço a página está exposta, em `src/main.ts`
- [X] T042 Encerrar o servidor e todas as conexões SSE no `SIGINT`/`SIGTERM`, em `src/main.ts`

---

## Phase 5 — US1: mapear uma tag olhando para o que está no ar (P1)

**Meta**: a razão de a feature existir. Ver a tag do tema em exibição e mapeá-la
sem redigitar, sem log e sem reinício.

**Teste independente**: com o serviço no ar e um tema em exibição, conferir que a
página mostra as tags desse tema e que criar um mapeamento por ela muda a cor
efetiva sem reinício.

- [X] T043 [US1] Renderizar em `src/adapters/painel/pagina.ts` o estado corrente: item, tema, **tags do tema**, cor extraída, cor efetiva, origem, e disponibilidade de Holyrics e Freestyler (FR-005)
- [X] T044 [US1] Distinguir visualmente cor extraída de cor efetiva quando houver override, nomeando a tag responsável, em `src/adapters/painel/pagina.ts` (FR-008)
- [X] T045 [US1] Tornar cada tag do tema um gatilho que cria o mapeamento **sem redigitar o texto**, em `src/adapters/painel/pagina.ts` (FR-006)
  > É o requisito que separa esta página de um editor de JSON com validação. A tag é digitada em dois programas e a 003 exige casamento sensível a acento — redigitar é o erro mais provável do fluxo inteiro, e é silencioso.
- [X] T046 [US1] Implementar o editor de `coresPorTag` como sequência **ordenada** — criar, remover e reordenar — em `src/adapters/painel/pagina.ts` (FR-014)
- [X] T047 [US1] Exibir "não há tag a mapear" quando o tema em exibição não tiver tags, em vez de campo vazio sem explicação, em `src/adapters/painel/pagina.ts`
- [X] T048 [US1] Marcar como **não exercitado** o mapeamento cuja tag nenhum tema em exibição usou, em `src/adapters/painel/pagina.ts`
  > Preparar mapeamento antes do culto é uso legítimo. Sem a marca, "ainda não bateu" e "está quebrado" têm a mesma aparência.
- [X] T049 [US1] Ligar o efeito `parametros_do_nucleo` ao despacho de T038 para que `coresPorTag` valha no ciclo seguinte, em `src/main.ts` — **sem** criar caminho de recarga próprio (FR-017)
- [X] T050 [US1] Publicar o estado por SSE a cada ciclo de leitura, ligando `src/service/painel.ts` ao `runtime` para que a troca de tema apareça sem recarregar (FR-007)

---

## Phase 6 — US2: ajustar qualquer campo sem derrubar o culto (P1)

**Meta**: todos os campos editáveis, cada um com o efeito dele e nenhum outro.

**Teste independente**: alterar, um a um, campos de categorias diferentes — um
parâmetro de decisão, um endereço de conexão, um destino de log — e verificar que
cada um passa a valer sem reinício e com o efeito colateral correto.

- [X] T051 [US2] Renderizar o formulário de **todos** os campos da configuração — conexão, decisão de cor, saída DMX, log, painel e mapeamento — em `src/adapters/painel/pagina.ts` (FR-010)
- [X] T052 [US2] Aplicar `ritmo_de_leitura` sem abandonar a leitura em curso, em `src/service/poller.ts`
- [X] T053 [US2] Aplicar `parametros_do_nucleo` substituindo `ParâmetrosDoNúcleo` do próximo ciclo, em `src/main.ts`
- [X] T054 [US2] Aplicar `zerar_estado_de_cor` em `src/main.ts` — referência, candidata e contagem a zero, de modo que a leitura seguinte seja adotada e anunciada de imediato — e **registrar no próprio código** por que este desvio do limiar é legítimo (**FR-021a**)
  > É o mesmo caminho de `primeira_leitura` que a 001/FR-009a já usa no arranque, e não uma exceção à regra anti-flicker da constitution. Sem a justificativa escrita ali, um leitor futuro lê o desvio como defeito e o "conserta" — quebrando a FR-021a sem que nenhum teste da 001 ou da 002 reclame.
- [X] T055 [US2] Aplicar `reconectar_holyrics` refazendo **apenas** o cliente HTTP, em `src/main.ts`
- [X] T056 [US2] Aplicar `reconectar_freestyler` e `reresolver_grupo`, com a transição registrada em log, em `src/main.ts`
- [X] T057 [US2] Acrescentar `atualizarParâmetros()` a `SaídaDMX` em `src/service/saida-dmx.ts`, enfileirado **depois** do envio em curso (FR-020)
  > `criarSaídaDMX` hoje fecha sobre `parâmetros` como constante. Recriar a saída inteira a cada recarga refaria conexão e resolução por qualquer mudança — o efeito colateral que a FR-019 proíbe.
- [X] T058 [US2] Aplicar `religar_saida` quando o bloco `freestyler` aparecer ou sumir, montando ou desmontando a saída DMX, em `src/main.ts`
- [X] T059 [US2] Aplicar `reconfigurar_log` — nível e destino — usando o logger recarregável, em `src/service/painel.ts`
- [X] T060 [US2] Aplicar `re_servir_painel`: escutar no endereço novo, encerrar o antigo, e **recusar a alteração mantendo o antigo** se o novo não abrir, em `src/service/painel.ts` (FR-018a)
- [X] T061 [US2] Avisar na página, antes de aplicar a troca de endereço, que a aba perderá a conexão e em que endereço ela volta, em `src/adapters/painel/pagina.ts` (FR-018a)
- [X] T062 [US2] Registrar em log toda recarga aceita nomeando **quais campos** mudaram, nunca o arquivo inteiro, em `src/service/painel.ts` (FR-022)
- [X] T063 [US2] Registrar em log o efeito `desconhecido` quando ele aparecer, em `src/service/painel.ts`
- [X] T064 [US2] Exibir a sobreposição de ambiente no campo afetado — hoje só `log.nivel` sob `LOG_LEVEL` —, dizendo que o valor salvo só valerá quando a variável sair, em `src/adapters/painel/pagina.ts` (FR-016a)

---

## Phase 7 — US3: uma configuração ruim não derruba nada (P1)

**Meta**: a página é a primeira porta de entrada externa do processo. Nada que
entre por ela pode derrubar o serviço nem corromper o arquivo.

**Teste independente**: submeter valores inválidos de categorias diferentes e
verificar, a cada um, que a recusa é explicada, que o arquivo não foi tocado e que
a configuração em execução não mudou.

- [X] T065 [US3] Responder **422** com caminho do campo e problema em submissão inválida, conforme [contracts/painel-http.md](contracts/painel-http.md), em `src/adapters/painel/servidor.ts` (FR-012)
- [X] T066 [US3] Garantir que `detalhe` **nunca** ecoa o valor recebido, reusando o formatador já existente em `src/adapters/config.ts`, em `src/service/painel.ts` (FR-016)
- [X] T067 [US3] Responder **500** em falha de gravação, mantendo a configuração em execução intacta, em `src/adapters/painel/servidor.ts` (FR-027)
- [X] T068 [US3] Exibir o erro no campo correspondente e permitir corrigir e reenviar sem perder o resto do formulário, em `src/adapters/painel/pagina.ts` (SC-003)
- [X] T069 [US3] Endurecer o servidor contra entrada malformada em `src/adapters/painel/servidor.ts`: corpo não-JSON, corpo grande demais (com teto), método errado na rota, `Content-Type` ausente — nenhum deles pode derrubar o processo
  > Esta é a tarefa que o Princípio IV ganhou nesta feature. Até aqui, "degradar sem cair" era sobre dependência ausente; agora é sobre entrada de fora.

---

## Phase 8 — US4: o arquivo continua sendo a verdade (P2)

**Meta**: a página lê e escreve o mesmo arquivo, preserva o que não exibe, e avisa
em vez de sobrescrever.

**Teste independente**: editar o arquivo à mão com a página aberta e verificar que
a página não sobrescreve a edição sem avisar.

- [X] T070 [US4] Devolver o hash junto da configuração em `GET /api/config`, em `src/adapters/painel/servidor.ts` (FR-026)
- [X] T071 [US4] Responder **409** quando o `hashBase` divergir do arquivo sem `forcar`, conferindo no passo 3 da ordem do contrato — **no momento da gravação**, não no recebimento —, em `src/service/painel.ts` (FR-026)
  > Conferir no recebimento deixaria aberta a janela entre validar e escrever, que é exatamente onde o conflito da FR-026 acontece.
- [X] T072 [US4] Oferecer na página as **duas** saídas do conflito — sobrescrever por inteiro, ou descartar as edições e recarregar do disco — sem nenhuma forma de fusão, em `src/adapters/painel/pagina.ts` (FR-026a)
- [X] T073 [US4] Verificar de ponta a ponta que a gravação de T036 preserva chaves desconhecidas do arquivo real, e não só no teste de unidade de `mesclarConfig`, em `src/service/painel.ts` (FR-025)
- [X] T074 [US4] Sinalizar `discoDivergente` na página quando o arquivo tiver mudado por fora, deixando claro que aqueles valores **ainda não estão valendo**, em `src/adapters/painel/pagina.ts` (FR-023a)
- [X] T075 [US4] Garantir que edição do arquivo por fora **não** dispara recarga a quente — nenhum observador de arquivo em `src/service/painel.ts` (FR-023a)
  > Tarefa de ausência, e por isso fácil de perder de vista. O que ela protege é a decisão de não pagar debounce, gravação parcial de terceiros e um caminho novo para configuração inválida alcançar serviço em execução.

---

## Phase 9 — Reversões de escopo

**Trabalho desta feature, não da próxima.** As três decisões que caem estão
nomeadas com o texto original em [spec.md § Reversões de escopo](spec.md#reversões-de-escopo).

- [X] T076 [P] Corrigir `CLAUDE.md`: retirar "Interface web ou qualquer UI" de *Fora de escopo*, registrando que o mapeamento continua no arquivo e que o que muda é ele deixar de ser o único caminho até lá
- [X] T077 [P] Corrigir `specs/002-saida-dmx-freestyler/spec.md`, seção *Out of Scope*, com a mesma nota
- [X] T078 [P] Corrigir `specs/003-override-cor-por-tag/spec.md`, seção *Out of Scope*: caem "Interface para editar o mapeamento" e "Recarregar a configuração sem reiniciar o serviço" — a segunda é a de maior consequência
- [X] T079 Atualizar a seção *Estado atual* e a tabela de *Decisões tomadas* de `CLAUDE.md` com o bloco `painel`, a recarga a quente e a convenção invertida em relação ao bloco `freestyler`

---

## Phase 10 — Verificação local

Partes 1 a 3 do [quickstart](quickstart.md). Não precisam do PC do culto.

- [X] T080 Rodar `npm test` e `npm run typecheck` e registrar o resultado, conferindo a tabela da Parte 1 do [quickstart](quickstart.md)
- [ ] T081 Executar os cenários 1 a 14 da Parte 2 do [quickstart](quickstart.md), com o Holyrics fechado, e registrar cada resultado
- [X] T082 Executar o cenário 15 do [quickstart](quickstart.md) a partir de outra máquina da LAN: `curl` para a porta do painel tem que falhar por conexão recusada (FR-003a, SC-009)
  > Se responder, o risco aceito da spec virou outro risco. É o cenário cuja falha reabre uma decisão de segurança.
- [X] T083 Executar o cenário 16 do [quickstart](quickstart.md): com `painel.host: "0.0.0.0"`, o mesmo `curl` de outra máquina **responde** (FR-003)
  > O par com T082. Sozinho, o teste negativo passaria também numa implementação em que a configuração de rede não funciona — o que satisfaz a FR-003a fingindo satisfazer a FR-003.
- [X] T084 Executar o cenário 17 do [quickstart](quickstart.md): salvar pela página, encerrar o serviço e subir de novo, conferindo que ele aceita o arquivo gravado (**SC-005**, FR-011)
  > É o único cenário que fecha o ciclo inteiro. A validação compartilhada da FR-011 e a mesclagem da FR-025 só se provam compatíveis num reinício de verdade.
- [ ] T085 Executar os cenários 18 a 25 da Parte 3 do [quickstart](quickstart.md), com o Holyrics no ar e sem Freestyler
- [ ] T086 Confirmar especificamente o cenário 25 do [quickstart](quickstart.md): mudar `leitura.regiao` faz a cor seguinte ser adotada **de imediato**, não depois dos ciclos de confirmação (FR-021a)

---

## Phase 11 — Verificação no PC do culto

Parte 4 do [quickstart](quickstart.md). Irredutível — exige Holyrics, Freestyler e
mesa ligada.

- [ ] T087 Executar o cenário 26 do [quickstart](quickstart.md): o ciclo inteiro da US1 em menos de 30 s (SC-001)
- [ ] T088 Executar os cenários 27 a 29 do [quickstart](quickstart.md): grupo não resolvido listando os existentes, troca de endereço do Freestyler, e recarga durante envio em curso (FR-009, FR-020, US2-2)
- [ ] T089 Executar o cenário 30 e retirar a marca de suposição de `src/adapters/config-escrita.ts`, ou registrar o comportamento observado se ele divergir (Princípio I)
- [ ] T090 Executar o cenário 31 e retirar a marca de suposição de `src/adapters/logger.ts`, ou registrar o comportamento observado (Princípio I)

---

## Phase 12 — Polimento

- [X] T091 [P] Conferir a cobertura do núcleo novo — `src/core/recarga.ts` e `src/core/mesclagem.ts` — e levá-la ao mesmo patamar de `src/core/` hoje
- [X] T092 [P] Revisar `src/adapters/painel/pagina.ts` sob o Princípio V: nenhum componente, estado ou abstração que sirva a um caso que ainda não existe
- [X] T093 Registrar em `specs/004-painel-de-configuracao/quickstart.md` os resultados das Phases 10 e 11, como as features anteriores fizeram

---

## Dependências

```
Phase 1 (setup)
  ├─→ Phase 2 (estado observável) ─┐
  └─→ Phase 3 (núcleo da recarga) ─┴─→ Phase 4 (bordas + escrita)
                                          ├─→ Phase 5 (US1)  ← MVP fecha aqui
                                          ├─→ Phase 6 (US2)
                                          ├─→ Phase 7 (US3)
                                          └─→ Phase 8 (US4)
                                                 └─→ Phase 10 → Phase 11 → Phase 12
Phase 9 (docs) — independente de tudo
```

- **Phase 2 e Phase 3 são independentes entre si** e podem correr em paralelo:
  tocam arquivos disjuntos (`state.ts`/`runtime.ts`/`saida.ts` contra
  `recarga.ts`/`mesclagem.ts`).
- **A Phase 4 depende das duas** e é o gargalo: nenhuma história começa sem ela.
- **US3 antes de US4 na prática**, ainda que não haja dependência formal: o
  caminho de recusa (422) precisa existir antes de o caminho de conflito (409)
  fazer sentido para quem testa.
- **Phase 9 não depende de código nenhum** e pode sair a qualquer momento.

## Paralelismo

| Onde | O que pode correr junto |
|---|---|
| Phase 1 | T001 e T002 |
| Phase 2 vs Phase 3 | blocos inteiros, arquivos disjuntos |
| Phase 2 | T010 em paralelo com T003–T008 |
| Phase 3 | T021 (mesclagem) em paralelo com T014–T020 (recarga) |
| Phase 4 | T026, T029 e T039 |
| Phase 9 | T076, T077 e T078 |
| Phase 12 | T091 e T092 |

## Estratégia de entrega

**MVP = Phases 1–5.** Ao fim da Phase 5 a US1 funciona **inteira**: o operador vê
a tag do tema no ar, mapeia sem redigitar, salva, e a cor muda sem reinício. Fecha
porque a Phase 4 já entrega o caminho de escrita completo — foi essa a correção
que a análise obrigou.

**Incremento seguinte = Phase 6.** É o bloco caro e o arriscado. Se algo desta
feature quebrar um culto, é ele — todo componente que guardou um valor de
configuração na subida passa a estar errado, e é a Phase 6 que corrige isso campo
a campo.

**Phases 7 e 8 endurecem.** A 7 protege o serviço da entrada nova; a 8 protege o
arquivo de quem edita pelos dois caminhos.

**A Phase 11 fica em aberto até o próximo culto**, como as Phases equivalentes da
002 e da 003. A feature pode ser dada por implementada com ela pendente, desde que
a dívida siga declarada — que é o que as tarefas T089 e T090 registram.
