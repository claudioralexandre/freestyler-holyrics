# Tasks: Override de cor por tag do tema

**Feature**: 003-override-cor-por-tag | **Data**: 2026-07-31

**Entrada**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md),
[research.md](research.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Regime de testes**: o Princípio III é **não-negociável** e toda esta feature é
núcleo puro. Cada tarefa de implementação tem a tarefa de teste imediatamente
antes, com número menor, e o teste precisa falhar antes de a implementação
existir. Onde o RED **não** é esperado, a tarefa diz isso explicitamente e explica
por quê — fingir RED onde ele não acontece é pior que não tê-lo.

## Format: `[ID] [P?] [Story] Descrição com caminho de arquivo`

- **[P]**: pode rodar em paralelo — arquivo distinto, sem dependência pendente
- **[US1] / [US2] / [US3]**: a que história de usuário a tarefa serve

---

## Phase 1 — Setup

- [X] T001 [P] Estender `config/config.example.json` com a seção `coresPorTag` conforme [contracts/config.md](contracts/config.md), comentada com: que é **array e não objeto** (a ordem é a precedência), que a ordem de cima para baixo decide o empate, e que remover a seção desliga a feature
- [X] T002 [P] Criar `tests/fixtures/tags-unicode.ts` com os pares de grafia NFC/NFD do mesmo texto acentuado, construídos em tempo de execução com `.normalize('NFC')` e `.normalize('NFD')` — **nunca como literais no arquivo**
  > Um literal NFD pode ser silenciosamente convertido pelo editor ou pelo git ao salvar, e o teste passaria comparando a string consigo mesma. Construir os dois lados a partir de uma origem só é o que torna o teste honesto.

---

## Phase 2 — Fundação: comparar e casar

**⚠️ Bloqueia todas as histórias.** Sem casamento correto, nenhuma outra tarefa é
verificável.

- [X] T003 Escrever em `tests/unit/override.test.ts` os testes de `normalizarTag`: ignora caixa; ignora espaço nas pontas; **casa as duas grafias Unicode** do mesmo acento (usando T002); **não** casa `ceu` com `céu`; espaço interno conta. Confirmar RED
- [X] T004 Implementar `normalizarTag` em `src/core/override.ts` (FR-006, FR-006a)
- [X] T005 Escrever os testes de `casarTag` cobrindo os cinco casos de `Casamento` do [modelo](data-model.md#casamento): `sem_mapeamento`, `sem_tema`, `sem_tags`, `nenhuma_mapeada` com as tags observadas, e `mapeada`. Confirmar RED
- [X] T006 Escrever em `tests/unit/override.test.ts` os testes de **precedência** de `casarTag`: vence a primeira entrada declarada, não a primeira tag do tema; inverter a configuração inverte o vencedor; a ordem das tags dentro do tema não influencia; `preteridas` traz as demais mapeadas. Incluir o caso da tag `2024` declarada **depois** de uma alfabética. Confirmar RED
- [X] T007 Implementar `casarTag` em `src/core/override.ts` (FR-005, FR-007, FR-007a)
- [X] T008 **Princípio I**: marcar em `casarTag`, no próprio código, a suposição **não verificada** sobre o formato real de uma tag do Holyrics, nomeando as três perguntas abertas de [research.md §4](research.md#4-como-uma-tag-do-holyrics-chega-de-verdade) e apontando o cenário 0 do quickstart
  > Nenhum tema **com** tag foi observado nesta instalação. A constitution proíbe implementar sobre contrato não verificado sem marcar a suposição no código.
- [X] T009 Escrever em `tests/unit/override.test.ts` os testes de `resolverCorEfetiva`: com `mapeada` devolve a cor declarada, origem `mapeada`, a tag e a extraída preservada (FR-008, FR-009); sem mapeamento devolve a extraída com origem `extraida`; **com override e extraída `null` devolve a declarada** (FR-008a); sem override e sem extraída devolve `null`. Confirmar RED
- [X] T010 Implementar `resolverCorEfetiva` em `src/core/override.ts`, devolvendo `CorEfetiva | null`

**Checkpoint**: `npm test` passa com Holyrics e Freestyler fechados. Cenário 1 do
quickstart.

---

## Phase 3 — US1: a cor da tag chega ao palco (P1) 🎯 MVP

**Objetivo**: com uma tag mapeada e o tema portando-a, a cor declarada é a que
segue para o palco.

**Teste independente**: alimentar leitura e tema diretamente, sem Holyrics, e
verificar que a cor anunciada é a declarada e não a extraída.

### Configuração

- [X] T011 [US1] Escrever em `tests/unit/config.test.ts` os testes da seção: aceita o array; **aceita a ausência** e a lista vazia (FR-002); preto é cor válida (FR-003); recusa componente fora de 0–255; recusa `tag` vazia ou só espaços apontando o índice; não ecoa valores na mensagem. Confirmar RED
- [X] T012 [US1] Estender o esquema `zod` em `src/adapters/config.ts` com `coresPorTag` como **array** de `{ tag, cor }`, opcional
- [X] T013 [US1] Escrever em `tests/unit/config.test.ts` o teste do invariante de carga (FR-004): duas tags que casam entre si são recusadas na subida com **as duas** nomeadas; o par de grafias Unicode idênticas na tela é recusado **e a mensagem diz que o conflito é de codificação**. Confirmar RED
- [X] T014 [US1] Implementar a validação entre campos de FR-004 em `src/adapters/config.ts`

### Núcleo — a efetiva alimenta a decisão

- [X] T015 [US1] Escrever em `tests/unit/presentation.test.ts` o teste de que `diferençaDeContexto` devolve o **casamento** junto do tema, calculado uma vez só. Confirmar RED
- [X] T016 [US1] Implementar o casamento no retorno de `diferençaDeContexto` em `src/core/presentation.ts`
- [X] T017 [US1] Escrever em `tests/unit/state.test.ts` o teste de que `aplicarCiclo` passa a **cor efetiva** — não a extraída — para `avaliarCor`, e de que o evento `cor_anunciada` carrega `origem`, `tag` e `extraída`. Confirmar RED
- [X] T018 [US1] Estender `ParâmetrosDoNúcleo` em `src/core/state.ts` com os mapeamentos, e `Evento` em `src/core/events.ts` com os três campos novos de `cor_anunciada`, conforme [contracts/events.md](contracts/events.md)
- [X] T019 [US1] Implementar em `src/core/state.ts` a resolução da efetiva antes de `avaliarCor`
- [X] T020 [US1] Escrever em `tests/unit/state.test.ts` o teste de que, **sem a seção**, todo o comportamento anterior é idêntico — mesma cor, mesmos anúncios, mesmos eventos (FR-002, SC-003). Confirmar RED
- [X] T021 [US1] Ligar os mapeamentos da configuração ao núcleo em `src/main.ts`
- [X] T022 [US1] **Não tocar em `src/core/stability.ts`.** Conferir por leitura que o mecanismo anti-flicker segue sem saber que override existe — é a garantia estrutural de FR-012, e não há teste que a substitua

**Checkpoint**: cenários 2, 3, 4 e 5 do quickstart. Cobre **SC-001**, **SC-003**
e **SC-007**.

---

## Phase 4 — US2: o override vale quando a extração não muda (P1)

**Objetivo**: provar o requisito que motiva a feature inteira.

**Teste independente**: duas leituras consecutivas com a **mesma** cor extraída e
temas diferentes, o segundo mapeado — a cor declarada é anunciada.

> **RED não é esperado aqui, e isso é o ponto.** Se a Phase 3 estiver certa, estes
> testes passam de primeira, porque o comportamento **emerge** de a efetiva
> alimentar o limiar. Passarem imediatamente confirma o desenho; falharem prova
> que a Phase 3 está errada. Escrever mesmo assim é obrigatório: sem eles, uma
> refatoração futura pode desfazer a emergência em silêncio.

- [X] T023 [US2] Escrever o teste de FR-010 em `tests/unit/state.test.ts`: cor extraída imutável entre ciclos, o tema troca para um mapeado, a cor declarada é anunciada
- [X] T024 [US2] Escrever em `tests/unit/state.test.ts` o teste de FR-011: saindo de um tema mapeado para um não mapeado, a extraída volta a ser anunciada mesmo sem ter mudado
- [X] T025 [US2] Escrever em `tests/unit/state.test.ts` o teste do cenário 3 da US2: dois temas mapeados para a **mesma** cor em sucessão não produzem anúncio nenhum
- [X] T026 [US2] Escrever em `tests/unit/state.test.ts` o teste de FR-013: dentro do mesmo tema mapeado, trocar de item e de slide **não** muda a cor
- [X] T027 [US2] Corrigir `src/core/state.ts` se qualquer um dos quatro falhar. Se todos passarem, registrar isso no comentário de `aplicarCiclo` em `src/core/state.ts` como o motivo de a efetiva entrar antes de `avaliarCor`

**Checkpoint**: cobre **SC-002** e **SC-006**.

---

## Phase 5 — As duas fronteiras

**Objetivo**: FR-008a abre uma condição, FR-014a mantém a vizinha fechada. Estão
no mesmo `if` do código de hoje.

> **Risco mais alto da feature.** Quem afrouxar a primeira tende a afrouxar a
> segunda junto, e o resultado é a luz acendendo exatamente quando a 002 decidiu
> não comandar nada (FR-027 de lá). São tarefas separadas de propósito.

- [X] T028 Escrever em `tests/unit/state.test.ts` os testes de FR-008a: com tema mapeado, a cor declarada é anunciada quando a **consulta de cor falhou**; idem quando a **região configurada não existe**; nos dois casos a extraída registrada é `null`. Confirmar RED
- [X] T029 Implementar em `src/core/state.ts` a saída da resolução de dentro da condição `leitura.cor.ok`
- [X] T030 Escrever em `tests/unit/state.test.ts` o teste de FR-014a: **sabidamente sem apresentação**, nada é anunciado, mapeado ou não. Confirmar RED — e conferir que ele falha por não anunciar, não por outro motivo
- [X] T031 Implementar a fronteira de FR-014a em `src/core/state.ts`, mantendo a resolução **dentro** da condição de apresentação
- [X] T032 [P] Escrever em `tests/unit/state.test.ts` o teste do caso terceiro: **consulta de item falhou** não é ausência sabida de apresentação, então a cor segue sendo avaliada e o override vale (FR-004a da 001)
- [X] T033 [P] Escrever em `tests/unit/state.test.ts` o teste de que `últimoSucesso.cor` avança **só** quando houve extração válida, mesmo com override ativo
  > É registro de leitura, não de anúncio. Confundir os dois faria o diagnóstico de "há quanto tempo o Holyrics não responde cor" mentir justamente durante um override.

**Checkpoint**: cenário 5b do quickstart. Cobre as duas linhas vizinhas.

---

## Phase 6 — US3: o operador entende de onde veio a cor (P2)

**Objetivo**: duas fontes de cor sem rastro é o começo de um diagnóstico
impossível.

**Teste independente**: aplicar cor por override e conferir que o registro nomeia
a tag responsável e preserva a extraída descartada.

- [X] T034 [US3] Implementar em `src/adapters/logger.ts` a origem no registro de `cor_anunciada`: `extraida` sem menção a tag; `mapeada` nomeando a tag e trazendo a cor extraída descartada, ou vazia quando não houve extração (FR-015)
- [X] T035 [US3] Implementar o registro de subida em `src/main.ts`: quantos mapeamentos foram carregados e quais tags cobrem (FR-016)
- [X] T036 [US3] Implementar em `src/adapters/logger.ts`, no registro de `tema_trocado`, o veredito do casamento: tags observadas e **não** mapeadas como aviso (FR-017), e o empate nomeando a vencedora e as preteridas (FR-007b)
- [X] T037 [US3] Conferir por leitura de `src/adapters/logger.ts` que `sem_tags` **não** gera linha: é o estado normal de quem não usa a feature, e registrá-lo encheria o log de ruído em todo culto

**Checkpoint**: cenários 6 e 9 do quickstart. Cobre **SC-004** e **SC-005**.

---

## Phase 7 — Emendas às specs anteriores

A spec manda corrigir as specs de origem **junto** da implementação, não depois.
As duas emendas são de texto; nenhuma muda código já escrito.

- [X] T038 [P] Emendar **FR-005b** em `specs/001-leitura-cor-holyrics/spec.md`: o tema passa a influenciar a cor quando, e somente quando, uma de suas tags estiver mapeada. Sem mapeamento, o texto original continua valendo palavra por palavra
- [X] T039 [P] Emendar **FR-003** em `specs/002-saida-dmx-freestyler/spec.md`: a parte sobre `item_trocado` fica intacta, a parte sobre `tema_trocado` cede. Registrar que a 002 **não muda de código** — ela lê `cor` e não pergunta a origem
- [X] T040 [P] Atualizar `specs/001-leitura-cor-holyrics/contracts/events.md` com os campos novos de `cor_anunciada` e `tema_trocado`, apontando para [contracts/events.md](contracts/events.md) desta feature

---

## Phase 8 — Verificação contra o real

Exige o Holyrics rodando. **O cenário 0 é pré-requisito de todos os outros.**

- [ ] T041 Executar o **cenário 0**: marcar um tema com `azul` e outro com `céu da tarde`, subir **sem** a seção, e ler no log a string exata que chegou de cada tag
- [ ] T042 Registrar o achado do cenário 0 em `specs/001-leitura-cor-holyrics/contracts/holyrics-api.md`, substituindo as três suposições em aberto por observação — e **retirar a marca de T008** se o formato se confirmar
- [ ] T043 Se o Holyrics **remover** acento ao salvar a tag, parar e corrigir FR-006 em `spec.md`: FR-006 promete que acento conta, e não poderia cumprir. É mudança de requisito, não de código
- [ ] T044 Executar os cenários 6, 7 e 8: a cor da tag no palco, o override valendo com extração parada, e a saída do override
- [ ] T045 Executar o cenário 10 por uma sessão inteira e contar linhas de envio no log — deve ser zero após a aplicação inicial (SC-006)
- [ ] T046 Executar o cenário 11: encerrar a apresentação com tema mapeado em exibição e confirmar que nenhuma cor mapeada é comandada (FR-014a)

---

## Phase 9 — Documentação

- [X] T047 [P] Atualizar `README.md`: a seção `coresPorTag`, por que é array, e as linhas de log novas
- [X] T048 [P] Atualizar `CLAUDE.md`: estado das três features, e a emenda de que o tema passa a poder influenciar a cor

---

## Dependências

```
Phase 1 (setup)
   └─> Phase 2 (comparar e casar)  ← bloqueia todo o resto
          └─> Phase 3 (US1)  ← MVP
                 ├─> Phase 4 (US2)   ← prova, não constrói
                 ├─> Phase 5 (fronteiras)
                 ├─> Phase 6 (US3)
                 └─> Phase 7 (emendas)
                        └─> Phase 8 (verificação real)
                               └─> Phase 9 (documentação)
```

US2, a Phase 5, a US3 e a Phase 7 são independentes entre si depois da US1.

## Paralelismo

Tarefas `[P]` tocam arquivos distintos. As de núcleo são sequenciais por tocarem
`override.ts`, `state.ts` e `presentation.ts`.

Oportunidades reais:

- **T001 e T002** — arquivos diferentes, nenhum depende do outro
- **T032 e T033** — testes distintos no mesmo arquivo, escreváveis em paralelo mas
  aplicados em sequência
- **T038, T039 e T040** — três specs distintas
- **T047 e T048** — dois documentos

## MVP

**Phase 1 + Phase 2 + Phase 3.** Ao fim da US1 o operador consegue fixar a cor de
um tema que sai errado, que é a feature inteira do ponto de vista de quem a pediu.

A Phase 4 não constrói nada — ela **prova** que o MVP resolve o caso que motivou a
feature. Pular a Phase 4 deixaria a US2 sem rede: o comportamento estaria certo por
emergência, e nada impediria uma refatoração de desfazê-lo em silêncio.

A Phase 5 é a que não pode ser adiada apesar de não ser história de usuário. Ela é
a única defesa contra a luz acender sem apresentação.

## Cobertura de critérios de sucesso

| Critério | Onde é verificado |
|---|---|
| SC-001 | T017, T019 + cenário 6 (T044) |
| SC-002 | T023 + cenário 7 (T044) |
| SC-003 | T020 + cenário 4 |
| SC-004 | T034 + cenário 6 |
| SC-005 | T036 + cenário 9 |
| SC-006 | T025, T026, T045 |
| SC-007 | Checkpoint da Phase 3 — se o cenário 6 precisou de mais que uma tag e três números, falhou |

## Contagem

| Fase | Tarefas |
|---|---|
| 1 — Setup | 2 |
| 2 — Comparar e casar | 8 |
| 3 — US1 | 12 |
| 4 — US2 | 5 |
| 5 — Fronteiras | 6 |
| 6 — US3 | 4 |
| 7 — Emendas | 3 |
| 8 — Verificação real | 6 |
| 9 — Documentação | 2 |
| **Total** | **48** |

Por história: **US1** 12, **US2** 5, **US3** 4. As 27 restantes são fundação,
fronteiras, emendas, verificação e documentação.

---

## Phase 10: Convergence

Lacunas entre o que spec, plano e constitution pedem e o que o código faz hoje.
Nenhuma é CRITICAL ou HIGH — o comportamento no palco satisfaz a spec, e as três
são de observabilidade e de escopo.

- [X] T049 Marcar na linha de debug de `registrarLeitura` em `src/adapters/logger.ts` que a referência do `deltaE` é uma cor de override, ou computar o ΔE contra a extraída anterior nesse caso, per FR-009 (partial) — hoje `src/main.ts:244` passa `estado.corDeReferência`, que sob override **é a cor declarada**, então o número passa a medir extraída-contra-declarada em vez da oscilação da extração. O comentário em `logger.ts:180` promete a segunda coisa, e o cenário 7 do quickstart manda comparar justamente esse ΔE antes e depois da troca de tema — com override ativo, aquele procedimento dá número enganoso
- [X] T050 Escrever `tests/unit/logger.test.ts` com logger de captura, no padrão já usado em `tests/unit/saida-dmx.test.ts`, cobrindo: origem e tag na cor anunciada e a extraída preservada (FR-015); a extraída **nula** quando a extração falhou sob override (FR-008a); as tags observadas quando nenhuma casa (FR-017); o empate nomeando vencedora e preteridas (FR-007b); e que tema **sem tag** não gera linha, per SC-004 e SC-005 (partial) — hoje nenhum teste toca `src/adapters/logger.ts`, então quatro requisitos de conteúdo de log e dois critérios de sucesso dependem só do quickstart manual
- [X] T051 Decidir o destino de `src/adapters/console.ts`, `tests/unit/console.test.ts` e da ligação de `criarPainelDeCor` em `src/main.ts` — especificar numa feature própria ou remover —, per plan: Project Structure (unrequested) — o painel de cor no terminal não é pedido por spec, plano ou tarefa alguma em `specs/`, e entra em `main.ts`, arquivo que a T021 desta feature também toca

> **T051 decidida em 2026-07-31: especificar como feature própria.** O painel
> resolve um problema real — o JSON do `pino` não se lê de relance durante um
> culto — e o Fluxo de Desenvolvimento da constitution não admite feature que
> comece por código. O código fica onde está até a spec existir; escrevê-la é
> trabalho da feature nova, não da 003.
>
> Próximo passo: `/speckit-specify` para o painel de cor no terminal. Isso
> reaponta `.specify/feature.json`, e a Phase 8 desta feature — que ainda depende
> do Holyrics — continua pendente aqui.
