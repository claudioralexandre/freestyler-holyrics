---
description: "Task list for 001-leitura-cor-holyrics"
---

# Tasks: Leitura de cor do Holyrics

**Input**: Design documents from `/specs/001-leitura-cor-holyrics/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: **OBRIGATÓRIOS no núcleo.** O Princípio III da constitution é
não-negociável: todo comportamento de `src/core/` nasce de um teste que falha
primeiro. Adaptadores (`src/adapters/`) ficam fora dessa obrigação — verificação
manual registrada basta, conforme o Princípio I.

**Organization**: agrupadas por user story, para que cada uma seja implementável
e testável de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: a qual user story a tarefa pertence (US1–US4)

## Path Conventions

Projeto único: `src/` e `tests/` na raiz do repositório, conforme a Structure
Decision do [plan.md](plan.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: o repositório hoje tem só documentação — esta fase cria o projeto.

- [X] T001 Criar `package.json` na raiz com `"type": "module"` e scripts `dev`, `build`, `test`, `start`
- [X] T002 [P] Criar `tsconfig.json` na raiz com `strict: true`, target ES2023, módulos NodeNext, `outDir: dist`
- [X] T003 [P] Criar `vitest.config.ts` na raiz apontando para `tests/unit`
- [X] T004 [P] Criar `.gitignore` incluindo `node_modules/`, `dist/`, `logs/` e `config/config.json` — o arquivo de config real nunca vai para o git
- [X] T005 Instalar dependências: `culori`, `pino`, `pino-roll`, `zod`; dev: `typescript`, `vitest`, `@types/node`
- [X] T006 [P] Criar esqueleto de diretórios: `src/core/`, `src/adapters/holyrics/`, `src/service/`, `tests/unit/`, `tests/fixtures/`, `config/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: fazer o serviço subir, ler configuração, consultar o Holyrics e
registrar — **sem ainda decidir nada sobre cor**.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase terminar.

- [X] T007 [P] Definir os tipos de evento em `src/core/events.ts` conforme [contracts/events.md](contracts/events.md), com `slide_mudou` e `item_trocado` como tipos distintos, para que o consumidor possa reagir a um sem reagir ao outro (FR-010b)
- [X] T008 [P] Definir `Cor`, `ItemEmExibição`, `Tema`, `LeituraDoCiclo`, `Resultado<T>`, `MotivoDeFalha`, `EstadoDoServiço` e o estado inicial em `src/core/state.ts` conforme [data-model.md](data-model.md). **`EstadoDoServiço` não tem campo de disponibilidade** — essa é conclusão sobre rede e vive em `src/service/availability.ts` (Princípio II)
- [X] T009 [P] Escrever teste das validações cruzadas de configuração em `tests/unit/config.test.ts` — `requestTimeoutMs < intervaloMs` (FR-004), `intervaloMaximoMs ≤ 30000` (FR-015a, o teto que torna o SC-005 alcançável), `intervaloMaximoMs ≥ intervaloInicialMs`. Deve falhar antes do T010
- [X] T010 Implementar em `src/adapters/config.ts`: schema `zod`, carregamento do arquivo e as três variáveis de ambiente do contrato — `HOLYRICS_TOKEN` (obrigatória), `CONFIG_PATH` e `LOG_LEVEL` (sobrepõe `log.nivel`). Separar a função pura de validação da leitura de disco, para que o T009 possa testá-la (FR-018, FR-019, FR-020)
- [X] T011 [P] Criar `config/config.example.json` conforme [contracts/config.md](contracts/config.md), com comentário deixando claro que `regiao` e `limiarDeltaE` ainda não foram calibrados
- [X] T012 [P] Implementar `src/adapters/logger.ts` com `pino` + `pino-roll`: níveis (respeitando `LOG_LEVEL` quando presente), arquivo rotacionado por tamanho com limite de arquivos mantidos, saída simultânea no terminal e redação de qualquer campo cujo nome contenha `token` (FR-013d, FR-013e, FR-013f, FR-013g, FR-013h, FR-013i, FR-019)
- [X] T013 [P] Criar respostas de exemplo em `tests/fixtures/holyrics-responses.ts` a partir de [contracts/holyrics-api.md](contracts/holyrics-api.md), incluindo os casos `data: null` e envelope de erro
- [X] T014 Implementar validação de resposta em `src/adapters/holyrics/schema.ts`: envelope, array de cor, faixa 0–255, item objeto-ou-nulo (tabela de validação do [data-model.md](data-model.md))
- [X] T015 Implementar `src/adapters/holyrics/client.ts`: `POST` de `GetColorMap`, `GetCurrentPresentation` e `GetCurrentTheme` (FR-005a) com `fetch` + `AbortSignal.timeout()`, traduzindo falhas para `MotivoDeFalha`
- [X] T015a **(Princípio I — obrigatória)** Marcar no próprio código a suposição não verificada: cabeçalho em `src/adapters/holyrics/client.ts` e `src/adapters/holyrics/schema.ts` declarando que o contrato veio de documentação, apontando [contracts/holyrics-api.md](contracts/holyrics-api.md) e nomeando o que ainda não foi observado. A marcação só sai no T065, depois da verificação
- [X] T016 Implementar o ciclo em `src/service/poller.ts`: intervalo regular vindo da configuração (FR-001), as três consultas do mesmo ciclo (FR-003) disparadas de forma independente via `Promise.allSettled` (FR-004a) e sem sobreposição entre ciclos (FR-004)
- [X] T017 Implementar em `src/service/runtime.ts` a composição das partes e o `subscribe()` completo (FR-013, FR-013b). O `snapshot()` nasce aqui com os campos que já existem — cor e horários — e **cresce a cada story**: item/slide/tema chegam no T049, disponibilidade no T058. Ele é uma composição de núcleo + serviço, nunca um espelho do estado do núcleo ([contracts/events.md](contracts/events.md), FR-013a)
- [X] T018 Criar ponto de entrada em `src/main.ts` — carrega config, monta o runtime, inicia o poller

**Checkpoint**: `npm start` sobe, faz um ciclo por segundo, registra o que
recebeu e não termina sozinho. Nenhuma cor foi decidida ainda, e o código do
adaptador do Holyrics carrega a marcação de contrato não verificado (T015a).

---

## Phase 3: User Story 1 - Saber qual cor está na tela agora (Priority: P1) 🎯 MVP

**Goal**: extrair a cor da região configurada e anunciá-la, tornando visível no
log qual cor está na tela.

**Independent Test**: com o Holyrics projetando um tema de cor conhecida, iniciar
o serviço e conferir no log que a cor anunciada corresponde ao telão; trocar para
tema de cor bem diferente e ver a cor anunciada mudar.

### Tests for User Story 1 ⚠️

> Escreva estes testes primeiro e confirme que falham antes do T021.

- [X] T019 [P] [US1] Testar seleção de região em `tests/unit/color.test.ts`: índice válido devolve a cor daquela posição; índice fora da faixa recebida produz `regiao_inexistente` (FR-002a); componente fora de 0–255 produz `resposta_invalida`
- [X] T020 [P] [US1] Testar em `tests/unit/state.test.ts` que a primeira leitura válida sem cor de referência é anunciada de imediato, com `motivo: primeira_leitura` e sem esperar confirmação (FR-009a)

### Implementation for User Story 1

- [X] T021 [US1] Implementar `selecionarRegiao` e validação de componentes em `src/core/color.ts` (FR-002, FR-002a)
- [X] T022 [US1] Implementar `aplicarCiclo` em `src/core/state.ts` emitindo `cor_anunciada` na primeira leitura válida (FR-009a)
- [X] T023 [US1] Ligar `poller` → `aplicarCiclo` → entrega de eventos em `src/service/poller.ts`
- [X] T024 [US1] Registrar `cor_anunciada` no nível `info` com horário e componentes legíveis em `src/adapters/logger.ts` (US1, cenário de aceitação 3)
- [X] T025 [US1] Registrar as 8 regiões de cada leitura no nível `debug` em `src/adapters/logger.ts` — é o que torna possível o cenário 4 do [quickstart.md](quickstart.md) (FR-013h)

**Checkpoint**: US1 funcional. A cor da tela aparece no log e o serviço já é
demonstrável — mas ainda pisca a cada variação do fundo.

---

## Phase 4: User Story 2 - Não perseguir variação irrelevante (Priority: P2)

**Goal**: transformar leitura correta em sinal utilizável, anunciando só mudanças
que ultrapassam o limiar perceptual e se sustentam.

**Independent Test**: alimentar a lógica com uma sequência sintética de leituras
oscilando levemente (nada anunciado), depois um salto grande e passageiro (nada
anunciado), depois um salto grande e sustentado (exatamente um anúncio). Roda sem
Holyrics.

### Tests for User Story 2 ⚠️

- [X] T026 [P] [US2] Testar em `tests/unit/color.test.ts` que o ΔE é determinístico: a mesma dupla de cores produz sempre o mesmo valor e a mesma decisão (FR-008a)
- [X] T027 [P] [US2] Testar em `tests/unit/stability.test.ts` que leituras abaixo do limiar não anunciam e preservam a referência (FR-007)
- [X] T028 [P] [US2] Testar que N leituras consecutivas acima do limiar produzem exatamente um anúncio (FR-007a)
- [X] T029 [P] [US2] Testar que uma leitura acima seguida de uma abaixo zera a contagem e nada é anunciado (FR-007b, edge case do flash)
- [X] T030 [P] [US2] Testar que a referência adotada é a **última** leitura da sequência de confirmação, não a que iniciou a contagem (FR-009)
- [X] T031 [P] [US2] Testar que as leituras candidatas não precisam ser idênticas entre si, só estar acima do limiar contra a referência (FR-007c)
- [X] T032 [P] [US2] Testar o afastamento gradual: passos individualmente abaixo do limiar cujo acumulado ultrapassa (US2, cenário 4)
- [X] T033 [P] [US2] Testar que oscilação entre duas cores distantes, sem nenhuma se sustentar por N ciclos, não anuncia nada (edge case)

### Implementation for User Story 2

- [X] T034 [US2] Implementar `deltaE` (CIEDE2000, via `culori`) em `src/core/color.ts` (FR-008)
- [X] T035 [US2] Implementar a máquina estável/confirmando em `src/core/stability.ts` (FR-006, FR-007a, FR-007b, FR-009)
- [X] T036 [US2] Integrar `stability` em `aplicarCiclo` de `src/core/state.ts`, preservando o caminho da primeira leitura
- [X] T037 [US2] Registrar o ΔE de cada leitura no nível `debug` em `src/adapters/logger.ts` — é o insumo do cenário 5 do [quickstart.md](quickstart.md)

**Checkpoint**: US1 + US2 funcionais. O sinal de cor está calmo o suficiente para
alimentar luzes.

---

## Phase 5: User Story 3 - Saber quando o que está na tela mudou (Priority: P3)

**Goal**: emitir eventos de item, slide e tema, e reconhecer explicitamente a
ausência de apresentação.

**Independent Test**: com o Holyrics projetando, trocar de música e ver
`item_trocado`; avançar de estrofe e ver `slide_mudou` sem `item_trocado`;
encerrar a apresentação e ver `apresentacao_encerrada`.

### Tests for User Story 3 ⚠️

- [X] T038 [P] [US3] Testar em `tests/unit/presentation.test.ts` que a mudança de `id` do item emite `item_trocado` com anterior e novo (FR-010)
- [X] T039 [P] [US3] Testar que avanço de slide no mesmo item emite `slide_mudou` e nenhum `item_trocado` (FR-010a)
- [X] T040 [P] [US3] Testar que retrocesso de slide emite `slide_mudou` com as posições corretas (US3, cenário 3)
- [X] T041 [P] [US3] Testar que a troca de item **não** emite `slide_mudou`, mesmo com a posição diferente (FR-010c)
- [X] T042 [P] [US3] Testar que item sem noção de slide não emite `slide_mudou` (edge case)
- [X] T043 [P] [US3] Testar que mudança apenas de `totalDeSlides` não emite evento algum (edge case)
- [X] T044 [P] [US3] Testar em `tests/unit/state.test.ts` que `apresentacao_encerrada` descarta a cor de referência, fazendo a primeira cor após o retorno vir com `motivo: primeira_leitura` (FR-012)
- [X] T045 [P] [US3] Testar que a troca de item **não** descarta a referência nem reanuncia cor quando o ΔE fica abaixo do limiar (FR-012a)
- [X] T046 [P] [US3] Testar que tema e tags não alteram a cor anunciada, o limiar nem a confirmação (FR-005b)
- [X] T046a [P] [US3] Testar que tema ausente (`data: null`, distinto de consulta falhada) não impede a leitura de cor nem interrompe o ciclo (FR-005c)
- [X] T047 [P] [US3] Testar a ordem de entrega dos eventos de um mesmo ciclo conforme [contracts/events.md](contracts/events.md)

### Implementation for User Story 3

- [X] T048 [US3] Implementar o diffing de item, slide e tema em `src/core/presentation.ts` (FR-010–FR-010d, FR-011)
- [X] T049 [US3] Integrar em `src/core/state.ts` com a precedência correta — identidade do item avaliada antes da posição (FR-010c) — e acrescentar item, slide, total e tema ao `snapshot()` do T017 (FR-013a)
- [X] T050 [US3] Implementar a ordenação de eventos do ciclo em `src/core/state.ts` — contexto antes de conteúdo, `cor_anunciada` por último
- [X] T051 [US3] Registrar eventos de item, slide e tema no nível `info` em `src/adapters/logger.ts` (FR-013j)

**Checkpoint**: US1 + US2 + US3 funcionais. O consumidor futuro tem cor e
contexto.

---

## Phase 6: User Story 4 - Sobreviver ao Holyrics ausente (Priority: P4)

**Goal**: garantir que nenhuma falha de dependência derrube o processo, e que a
recuperação seja automática.

**Independent Test**: iniciar com o Holyrics fechado, verificar que o serviço vive
e registra a indisponibilidade; abrir o Holyrics e ver a leitura começar sem
reiniciar nada.

### Tests for User Story 4 ⚠️

- [X] T052 [P] [US4] Testar em `tests/unit/backoff.test.ts` a progressão 1s → 2s → 4s → 8s → 15s, sem ultrapassar o teto (FR-015)
- [X] T053 [P] [US4] Testar que uma tentativa bem-sucedida devolve o intervalo ao valor inicial (FR-015b)
- [X] T054 [P] [US4] Testar em `tests/unit/state.test.ts` que a falha de uma consulta preserva o pedaço de estado dela e não invalida as outras (FR-004a)
- [X] T055 [P] [US4] Testar em `tests/unit/availability.test.ts` que a disponibilidade só é dada como perdida quando **todas** as consultas do ciclo falham, e que falha isolada não gera transição (FR-004c)
- [X] T056 [P] [US4] Testar que `últimoSucesso` é registrado por consulta, permitindo distinguir "não mudou" de "não é lido há dez minutos" (FR-013a, edge case)

### Implementation for User Story 4

- [X] T057 [US4] Implementar a progressão de intervalo em `src/core/backoff.ts` (FR-015, FR-015b)
- [X] T058 [US4] Implementar `src/service/availability.ts` separando a **decisão pura** (dados os resultados do ciclo, o Holyrics está perdido?) da aplicação: emitir `holyrics_perdido`/`holyrics_recuperado` uma vez por transição, sem repetir a cada tentativa, e incluir a disponibilidade no `snapshot()` do T017 (FR-016, FR-004c, FR-013a)
- [X] T059 [US4] Implementar a classificação de erro em `src/adapters/holyrics/client.ts`, distinguindo indisponibilidade de credencial recusada — de forma conservadora enquanto o contrato não estiver verificado (FR-017)
- [X] T060 [US4] Aplicar o backoff ao ciclo em `src/service/poller.ts` (FR-014, FR-015)
- [X] T061 [US4] Isolar falha do consumidor em `src/service/runtime.ts`: exceção do ouvinte é capturada, registrada e descartada sem interromper o ciclo (FR-013c)
- [X] T062 [US4] Tolerar falha de escrita de log em `src/adapters/logger.ts`: caminho inválido, disco cheio ou permissão negada não derrubam o serviço (FR-013i)
- [X] T063 [US4] Registrar falha parcial uma única vez enquanto a condição persistir, em `src/service/poller.ts` (FR-004b)

**Checkpoint**: todas as user stories funcionais. O serviço aguenta um culto.

---

## Phase 7: Verificação de contrato, calibração e fechamento

**Purpose**: transformar suposição em fato observado. **Sem esta fase a feature
não está pronta**, por mais verde que a suíte esteja.

### Verificação (Princípio I — bloqueia a conclusão)

- [X] T064 Executar o procedimento de verificação de [contracts/holyrics-api.md](contracts/holyrics-api.md) contra um Holyrics real e substituir cada linha "A verificar" por observação, trocando o status de cada seção (FR-021)
- [X] T065 Corrigir `src/adapters/holyrics/schema.ts` e `src/adapters/holyrics/client.ts` onde a verificação do T064 divergir do suposto, e **remover a marcação de suposição do T015a** — o código deixa de ser presunção e passa a ser contrato observado
- [X] T066 Registrar a resposta exata do Holyrics a um token inválido e ajustar a classificação `credencial_recusada` do T059 (FR-017)
- [X] T067 Confirmar a superfície de API do `culori` (`differenceCiede2000`, `converter('lab')`) contra a versão instalada e ajustar `src/core/color.ts` se divergir

### Calibração (valores hoje são chute declarado)

- [X] T068 Executar o cenário 4 do [quickstart.md](quickstart.md), escolher o índice de região que representa o tema e gravar em `config/config.example.json`, registrando a descoberta em [contracts/holyrics-api.md](contracts/holyrics-api.md)
- [X] T069 Executar o cenário 5 do [quickstart.md](quickstart.md), medir a variação de ΔE em repouso e definir `cor.limiarDeltaE` acima do ruído observado, validando o SC-003
- [X] T070 Medir a latência típica das três consultas contra `localhost` e definir `holyrics.requestTimeoutMs` com folga (FR-004)

### Fechamento

- [X] T071 [P] Atualizar `CLAUDE.md`: remover "controle no nível de slide/estrofe" da lista de fora de escopo (contradiz a spec desde a rodada de clarify), e registrar stack, estrutura de diretórios e comandos
- [X] T072 [P] Criar `README.md` com instruções de instalação, configuração e execução
- [ ] T073 Executar o [quickstart.md](quickstart.md) inteiro, cenários 1 a 7, e confirmar SC-001 a SC-010
- [X] T074 Confirmar o SC-007 buscando por credencial no arquivo de log em cenários de erro, incluindo token inválido e config malformada

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende da Phase 1 — **bloqueia todas as stories**
- **US1 (Phase 3)**: depende da Phase 2
- **US2 (Phase 4)**: depende da US1 — a estabilidade opera sobre a cor que a US1 extrai
- **US3 (Phase 5)**: depende da Phase 2 apenas. Independente da US2
- **US4 (Phase 6)**: depende da Phase 2 apenas. Independente da US2 e da US3
- **Phase 7**: depende de todas as stories desejadas

### User Story Dependencies

Ao contrário do padrão, **a US2 não é independente da US1**: ela decide sobre a
cor que a US1 produz. As demais são independentes entre si.

- **US1 (P1)**: nenhuma dependência de outra story — é o MVP
- **US2 (P2)**: precisa da US1
- **US3 (P3)**: independente. Pode ser feita antes da US2 se a prioridade mudar
- **US4 (P4)**: independente. Toca `poller` e `runtime`, que a US1 também toca — evitar paralelismo com a US1 no mesmo arquivo

### Within Each User Story

- Testes primeiro, falhando, antes de qualquer implementação (Princípio III)
- Núcleo antes de integração no serviço
- Log por último dentro de cada story

### Parallel Opportunities

- T002, T003, T004, T006 na Phase 1
- T007, T008, T009, T011, T012, T013 na Phase 2 — arquivos distintos
- Todos os testes de cada story (marcados [P]) rodam juntos: T019–T020, T026–T033, T038–T047 (inclui T046a), T052–T056
- T071 e T072 na Phase 7

**Conflitos a evitar**: `src/core/state.ts` é tocado pelas quatro stories e
`src/adapters/logger.ts` por três. Não paralelizar tarefas de implementação que
caiam no mesmo arquivo.

---

## Parallel Example: User Story 2

```bash
# Os oito testes da US2 são arquivos e casos independentes — escreva todos antes
# de qualquer implementação, e confirme que todos falham:
Task: "T026 ΔE determinístico em tests/unit/color.test.ts"
Task: "T027 leitura abaixo do limiar não anuncia em tests/unit/stability.test.ts"
Task: "T028 N consecutivas acima anunciam uma vez"
Task: "T029 salto passageiro zera a contagem"
Task: "T030 referência adotada é a última da sequência"
Task: "T031 candidatas não precisam ser idênticas entre si"
Task: "T032 afastamento gradual acumulado"
Task: "T033 oscilação entre duas cores distantes não anuncia"
```

---

## Implementation Strategy

### MVP (US1)

1. Phase 1: Setup
2. Phase 2: Foundational — bloqueia tudo
3. Phase 3: US1
4. **PARE E VALIDE**: cenário 6 do quickstart, coluna de cor

O MVP já entrega o que mais importa provar: que a leitura de cor do Holyrics
funciona. É deliberadamente o maior risco do projeto, atacado primeiro.

### Entrega incremental

1. Setup + Foundational → serviço sobe e sobrevive
2. + US1 → a cor da tela aparece no log (**MVP**)
3. + US2 → o sinal fica utilizável por luzes
4. + US3 → contexto de item, slide e tema
5. + US4 → aguenta um culto sem babá
6. + Phase 7 → suposição vira fato; a feature fecha

### Sobre trabalho em paralelo

Projeto de uma pessoa só. A seção de paralelismo acima serve para agrupar
trabalho numa mesma sessão, não para dividir entre pessoas.

---

## Notes

- **A Phase 7 não é polimento opcional.** T064 a T070 são a diferença entre um
  serviço que passa nos testes e um que acerta a cor durante o culto. A suíte
  verde prova que o núcleo faz o que foi pedido, não que o que foi pedido
  corresponde ao Holyrics real.
- `config/config.json` nunca entra no git; só o `.example.json`.
- Commit a cada tarefa ou grupo lógico.
- Qualquer teste de núcleo que precise de rede para passar indica violação do
  Princípio II — pare e corrija a fronteira antes de seguir.
