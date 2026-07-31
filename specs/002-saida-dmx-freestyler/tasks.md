# Tasks: Saída DMX para o Freestyler

**Feature**: 002-saida-dmx-freestyler | **Data**: 2026-07-29

**Entrada**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md),
[research.md](research.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Regime de testes**: o Princípio III é não-negociável. Toda tarefa de núcleo tem
a tarefa de teste **imediatamente antes**, com número menor, e o teste precisa
falhar antes de a implementação existir. O critério não é a pasta:
`protocolo.ts` mora em `adapters/` e entra no regime, porque é função pura de
string.

> **Revisado em 2026-07-29 após `/speckit-analyze`.** Onze achados corrigidos.
> Os que mudaram a estrutura desta lista: o núcleo virou **duas** funções
> (`aplicarEvento` e `planejarEnvio`), a confirmação de seleção subiu para a
> Phase 3, e a numeração de teste e implementação foi acertada onde estava
> invertida.

---

## Phase 1 — Setup

- [X] T001 Criar `tests/fixtures/freestyler-responses.ts` com as respostas **reais** capturadas do FreeStyler 4.1.7, transcritas de [contracts/freestyler.md](contracts/freestyler.md): versão, nomes de grupos, status de grupos, nomes de fixtures, endereços e fixtures selecionadas
- [X] T002 [P] Estender `config/config.example.json` com o bloco `freestyler` conforme [contracts/config.md](contracts/config.md), com comentário explicando que `grupo` é o nome tal como aparece no Freestyler

## Phase 2 — Fundação: o formato de fio

Bloqueia tudo o mais. Sem codificar e decodificar corretamente, nenhuma outra
tarefa é verificável.

- [X] T003 Escrever `tests/unit/protocolo.test.ts` para a **codificação** `FSOC`: código e argumento com zero à esquerda em 3 casas; `FSOC002255` blackout; `FSOC130255` e `FSOC130000` slot de cor; `FSOC036255` grupo 3; código de 3 dígitos acima de 99 (grupo 11 = 550). Confirmar RED
- [X] T004 Implementar a codificação `FSOC` em `src/adapters/freestyler/protocolo.ts`
- [X] T005 Escrever em `tests/unit/protocolo.test.ts` os testes de **decodificação** `FSBC`: envelope `FSBC` + byte de contagem + `,` + valores; lista de nomes com posições vazias; lista de inteiros; valor único (versão, master intensity); resposta truncada ou fora de formato vira falha, nunca exceção. Confirmar RED
- [X] T006 Implementar a decodificação `FSBC` em `src/adapters/freestyler/protocolo.ts`
- [X] T007 Escrever teste de que o heartbeat `0xFF` **não** é confundido com resposta de consulta (FR-021c). Confirmar RED, depois implementar a separação em `protocolo.ts`

## Phase 3 — US1: a luz assume a cor do telão (P1)

**Objetivo**: `cor_anunciada` vira cor nas fixtures do grupo seguidor.

**Teste independente**: injetar `cor_anunciada` no runtime da 001 e observar o
grupo assumir a cor, sem Holyrics.

### Núcleo — resolução de grupo

- [X] T008 [US1] Escrever `tests/unit/grupo.test.ts` para `resolverGrupo`: casa exato; casa ignorando caixa; casa ignorando espaço nas pontas; **não** casa ignorando acento (FR-009b); `nao_encontrado` com a lista de candidatos (FR-010); `ambiguo` quando dois grupos casam (FR-009c); ignora posições vazias do array de 24. Confirmar RED
- [X] T009 [US1] Implementar `resolverGrupo` em `src/core/grupo.ts` (FR-008, FR-009a)

### Núcleo — a semântica de toggle

- [X] T010 [US1] Escrever em `tests/unit/grupo.test.ts` os testes de `precisaSelecionar`: grupo já ativo no status → **não** enviar; grupo inativo → enviar; outro grupo ativo → enviar apenas o nosso, nunca desativar o outro (FR-012a-2); chamada duas vezes com o mesmo status produz o mesmo resultado (FR-012a-1). Confirmar RED
- [X] T011 [US1] Implementar `precisaSelecionar` em `src/core/grupo.ts` (FR-012a)

> **Tarefa de maior risco da feature.** A versão errada — enviar sempre "por
> garantia" — apagaria a luz em toda aplicação par, e o sintoma no palco seria
> luz piscando sem causa aparente. Ver [research.md](research.md) §3.

### Núcleo — do evento para a intenção

- [X] T012 [US1] Escrever `tests/unit/saida.test.ts` para `aplicarEvento`: `cor_anunciada` define `corPretendida` e marca `jáHouveCor` (FR-002); `tema_trocado`, `item_trocado`, `apresentacao_iniciada` e `slide_mudou` **não** alteram `corPretendida` (FR-003, FR-006); `holyrics_perdido` mantém a cor (FR-005). Confirmar RED
- [X] T013 [US1] Implementar `aplicarEvento` em `src/core/saida.ts` — pura, sem noção de rede (FR-015a)

### Núcleo — da intenção para as ações

- [X] T014 [US1] Escrever em `tests/unit/saida.test.ts` os testes de `planejarEnvio`: sem divergência entre pretendida e escrita → lista vazia (FR-015); com divergência e `mesa === null` → `ler_mesa`; com `mesa` lida e grupo `null` → `resolver_grupo`; grupo resolvido e inativo → `garantir_selecao` seguido de `confirmar_selecao` (FR-015c); tudo resolvido → `escrever_cor`. Confirmar RED
- [X] T015 [US1] Implementar `planejarEnvio` em `src/core/saida.ts`, devolvendo só a lista de ações, sem executar nada (Princípio II)
- [X] T016 [US1] Escrever teste de que uma aplicação de cor produz um **número fixo e pequeno** de comandos — seleção mais um por slot — e que esse número **não cresce** com o tamanho do grupo (FR-014). Confirmar RED, depois ajustar se necessário
- [X] T017 [US1] Escrever teste de que `planejarEnvio` **nunca** produz ação de restaurar seleção anterior, qualquer que seja o status lido (FR-012c). Confirmar RED

### Configuração

- [X] T018 [US1] Escrever em `tests/unit/config.test.ts` as validações novas: `corDeRepouso` exigida quando há `grupo` (FR-026a); **preto é valor válido** (FR-026b); `corDeRepouso` é única, não aceita por fixture (FR-026d); `heartbeatTimeoutMs` mínimo 4500 (FR-021b); `host` e `port` configuráveis com padrão (FR-023); bloco ausente é válido. Confirmar RED
- [X] T019 [US1] Estender `src/adapters/config.ts` com o schema `zod` do bloco `freestyler`, no mesmo arquivo da 001 (FR-022)

### Adaptador e serviço

- [X] T020 [US1] Implementar `src/adapters/freestyler/client.ts`: socket TCP sobre `node:net`, `conectar`, `enviar`, `consultar`, `fechar`. Sem regra de negócio, **sem `process.on` global** — o oposto do que a biblioteca faz (Princípio IV)
- [X] T021 [US1] Implementar `src/service/saida-dmx.ts`: assinar `subscribe()` da 001 (FR-001), chamar `aplicarEvento` e `planejarEnvio`, executar as ações na ordem, com envios serializados (FR-016)
- [X] T022 [US1] Implementar a execução de `confirmar_selecao`: reler o status e só então escrever cor; seleção não confirmada é falha de envio (FR-015c)
- [X] T023 [US1] Ligar a saída em `src/main.ts`, atrás da presença do bloco `freestyler` na config
- [X] T024 [US1] Implementar o log de aplicação de cor em nível detalhado: cor de origem, grupo e valor de cada slot (FR-024, SC-007)

**Checkpoint**: cenário 6 do quickstart. Cobre **SC-001**, **SC-002** e
**SC-007**.

## Phase 4 — US2: o Freestyler fechado não derruba o culto (P2)

- [X] T025 [US2] Escrever `tests/unit/heartbeat.test.ts` para `avaliarPulso`: dentro da janela → disponível; além da janela → indisponível; transição emite evento **uma vez** (FR-021); primeiro ciclo registra o estado encontrado sem fingir transição (`jáAvaliado`); o pulso **não** conta como confirmação de comando (FR-021c). Confirmar RED
- [X] T026 [US2] Implementar `avaliarPulso` em `src/core/heartbeat.ts` (FR-021a, FR-021b)
- [X] T027 [US2] Ligar o heartbeat ao cliente: cada `0xFF` recebido atualiza `últimoPulso`; a avaliação roda em intervalo próprio
- [X] T028 [US2] Escrever teste de que, na reconexão, é a **cor pretendida** que é reaplicada — não a fila de cores que passaram (FR-020). Confirmar RED
- [X] T029 [US2] Implementar a reaplicação na reconexão e o backoff, reaproveitando `src/core/backoff.ts` da 001 (FR-018, FR-019)
- [X] T030 [US2] Implementar o log de transição de disponibilidade, uma linha por transição, nunca por tentativa (FR-021, FR-025)
- [X] T031 [US2] Escrever teste de que exceção ao processar um evento é capturada e descartada sem interromper o consumo (FR-007). Confirmar RED, depois implementar

**Checkpoint**: cenário 9 do quickstart. Cobre **SC-003** e **SC-004**.

## Phase 5 — US3: sem apresentação, estado definido (P3)

- [X] T032 [US3] Escrever em `tests/unit/saida.test.ts` os testes da trava de FR-027: com `jáHouveCor === false`, `planejarEnvio` devolve **lista vazia** qualquer que seja o estado; `apresentacao_encerrada` antes da primeira cor não gera repouso. Confirmar RED
- [X] T033 [US3] Implementar a trava em `src/core/saida.ts` (FR-027)
- [X] T034 [US3] Escrever testes do repouso depois da primeira cor: `apresentacao_encerrada` leva à `corDeRepouso` (FR-004, FR-027a); cor preta anunciada é aplicada como cor normal, não confundida com repouso (FR-026c). Confirmar RED
- [X] T035 [US3] Implementar o repouso em `src/core/saida.ts`
- [X] T036 [US3] Implementar o log de "aguardando a primeira cor" (FR-027b), sem o qual "ainda não houve apresentação" e "integrador quebrado" têm o mesmo sintoma

**Checkpoint**: cenários 5 e 8 do quickstart. Cobre **SC-008** e **SC-011**.

## Phase 6 — US4: o operador descobre por que não funciona (P4)

- [X] T037 [US4] Escrever teste de que a resolução é retentada enquanto o grupo não for resolvido **e houver cor a aplicar**, e **não** é retentada depois de resolvida (FR-011a). Confirmar RED
- [X] T038 [US4] Implementar a retentativa em `src/core/saida.ts`, como parte de `planejarEnvio`
- [X] T039 [US4] Escrever teste de que a falha de resolução é registrada **apenas na mudança de condição**, não a cada tentativa (FR-011b). Confirmar RED
- [X] T040 [US4] Implementar a supressão de log repetido
- [X] T041 [US4] Implementar a leitura do inventário na subida e a cada reconexão: versão, grupos, fixtures e endereços (FR-011). A decodificação já está coberta por T005/T006
- [X] T042 [US4] Implementar o log do inventário em nível normal, com o grupo resolvido destacado (FR-025a)
- [X] T043 [US4] Implementar as mensagens de grupo não encontrado (FR-010, com a lista dos existentes) e de grupo ambíguo (FR-009c, com os conflitantes), sem derrubar o processo (FR-010a)

**Checkpoint**: cenários 3 e 4 do quickstart. Cobre **SC-006** e **SC-009**.

## Phase 7 — Envio robusto

- [X] T044 Escrever testes do tudo-ou-nada: falha em qualquer comando do envio **não** avança `últimoConjuntoEscrito` (FR-029); a divergência dispara reenvio mesmo sem queda de conexão (FR-029a). Confirmar RED
- [X] T045 Implementar o tudo-ou-nada em `src/service/saida-dmx.ts`, com reagendamento em backoff
- [X] T046 Escrever teste de que cor nova durante envio em curso resulta na cor **mais recente** ao final, descartando intermediárias (FR-017). Confirmar RED
- [X] T047 Implementar a serialização e o descarte de intermediárias
- [X] T048 Implementar o log de falha de envio com a divergência entre pretendida e escrita (FR-029b)
- [X] T049 Implementar o encerramento que **não** comanda nada, aguardando apenas envio em curso (FR-028, FR-028a)
- [X] T050 [P] **Revisão de vocabulário e de não-requisitos.** Conferir em código, tipos e log que: nada afirma "entregue" ou "aplicada" para cor, só "escrita" (FR-015b); não existe transição temporizada própria (FR-013, FR-013a); não existe intervalo mínimo entre envios (FR-031); não existe restauração de seleção (FR-012c). São requisitos negativos, verificáveis por leitura e não por teste

**Checkpoint**: cobre **SC-010**.

## Phase 8 — Verificação contra o real

Exigem Freestyler e Holyrics rodando.

- [ ] T051 Executar o cenário 7 do quickstart — seis mudanças de cor seguidas — e confirmar que a luz acompanha **todas**. É a verificação de que T011 ficou correta
- [ ] T052 Executar o cenário 5: subir sem apresentação e confirmar que o status de grupos da mesa não muda (SC-011)
- [ ] T053 Executar o cenário 9: fechar e reabrir o Freestyler, medir o tempo até a cor voltar (SC-004)
- [ ] T054 Medir SC-005: 30 minutos com a cor parada, contar linhas de envio no log — deve ser zero após a aplicação inicial
- [ ] T055 Executar o quickstart inteiro, cenários 1 a 10, e confirmar SC-001 a SC-011
- [ ] T056 Registrar em [contracts/freestyler.md](contracts/freestyler.md) o que a operação real revelar, especialmente os itens hoje listados como "A verificar"

## Phase 9 — Documentação

- [X] T057 [P] Atualizar `README.md`: configuração por nome de grupo, o que aparece no log, e o efeito colateral de a seleção da mesa mudar (FR-012b)
- [X] T058 [P] Atualizar `CLAUDE.md`: estado das duas features e pendências restantes
- [X] T059 [P] Atualizar os scripts de operação se a configuração nova exigir passo adicional

---

## Dependências

```
Phase 1 (setup)
   └─> Phase 2 (protocolo)  ← bloqueia todo o resto
          └─> Phase 3 (US1)  ← MVP
                 ├─> Phase 4 (US2)
                 ├─> Phase 5 (US3)
                 ├─> Phase 6 (US4)
                 └─> Phase 7 (envio robusto)
                        └─> Phase 8 (verificação real)
                               └─> Phase 9 (documentação)
```

US2, US3, US4 e a Phase 7 são independentes entre si depois da US1.

## Paralelismo

Tarefas marcadas `[P]` tocam arquivos distintos. As de núcleo são sequenciais por
tocarem `grupo.ts` e `saida.ts`.

## MVP

**Phase 1 + Phase 2 + Phase 3.** Ao fim da US1 o projeto faz o que se propôs
desde o começo: a cor do telão chega na luz.

A confirmação de seleção (FR-015c) foi **movida para dentro da Phase 3** na
revisão de 29/07. Estava na Phase 7, o que faria o MVP escrever cor sem saber em
que grupo — que é exatamente como a cor vaza para fixtures erradas. Um MVP pode
ser incompleto; não pode ser incorreto.

## Cobertura de critérios de sucesso

| Critério | Onde é verificado |
|---|---|
| SC-001 | T024 + cenário 6 (T055) |
| SC-002 | Checkpoint da Phase 3 + cenário 6 |
| SC-003 | Checkpoint da Phase 4 + cenário 9 (T053) |
| SC-004 | T028, T029, T053 |
| SC-005 | T054 |
| SC-006 | T043 + cenário 4 |
| SC-007 | T024 |
| SC-008 | Checkpoint da Phase 5 + cenário 8 |
| SC-009 | T042 + cenário 3 |
| SC-010 | Checkpoint da Phase 7 + T044 |
| SC-011 | T032, T052 |
| SC-012 | T066 + cenário 3 |

## Contagem

| Fase | Tarefas |
|---|---|
| 1 — Setup | 2 |
| 2 — Protocolo | 5 |
| 3 — US1 | 17 |
| 4 — US2 | 7 |
| 5 — US3 | 5 |
| 6 — US4 | 7 |
| 7 — Envio robusto | 7 |
| 8 — Verificação real | 6 |
| 9 — Documentação | 3 |
| 10 — Convergência | 3 |
| 11 — Emenda de 31/07 | 5 |
| **Total** | **67** |

## Phase 10: Convergence

Lacunas encontradas ao avaliar o código contra spec, plan e constitution, e que
**não** estão cobertas pelas tarefas pendentes das fases 4 a 9.

- [X] T060 Registrar em nível **info** a aplicação de cor e as entradas e saídas de repouso, mantendo o detalhe por slot em debug, per FR-025 (partial) — hoje `cor escrita` só existe em `log.debug`, então num culto com log normal nada indica que a luz foi comandada
- [X] T061 Chamar `invalidarGrupo()` na reconexão ao Freestyler, para que o grupo seja reverificado, per FR-011 (partial) — o método existe em `src/service/saida-dmx.ts` e não tem nenhum chamador; sem isso, um grupo renomeado enquanto a mesa esteve fora nunca é redetectado
- [X] T062 **CRITICAL para o Princípio IV**: mover o registro de `process.on('uncaughtException')` e `process.on('unhandledRejection')` em `src/main.ts` para **antes** da montagem da saída DMX, per Constitution IV (partial) — hoje a saída sobe em `main.ts:178` e os handlers só entram em `main.ts:192`, então uma exceção durante a montagem derruba o processo

## Phase 11 — Emenda da spec de 2026-07-31

A sessão de clarificação de 31/07 acrescentou três requisitos e um critério de
sucesso depois de a lista acima estar fechada. FR-008a descreve comportamento que
o esquema de configuração **já tinha**; os outros dois são código novo.

- [X] T063 Escrever teste de que o bloco `freestyler` presente sem `grupo` é recusado na subida, e de que o bloco ausente por inteiro segue aceito (FR-008a). Confirmar se já passa — é requisito que documenta comportamento existente, e o teste é a prova de que documenta certo
- [X] T064 Escrever teste de `consultaTimeoutMs`: padrão declarado, e recusa quando passa da metade de `heartbeatTimeoutMs` (FR-023a). Confirmar RED
- [X] T065 Implementar `consultaTimeoutMs` no esquema de `src/adapters/config.ts`, com a validação entre campos, e ligá-lo ao cliente em `src/main.ts` — hoje o prazo existe em `client.ts` com padrão fixo, fora do alcance do operador
- [X] T066 Escrever teste de que a seleção efetivada consulta `FSBC023000` e registra quantas e quais fixtures foram atingidas, e de que nenhuma atingida vira aviso (FR-025b, SC-012). Confirmar RED
- [X] T067 Implementar a consulta de fixtures selecionadas em `src/service/saida-dmx.ts`, reaproveitando os nomes lidos no inventário e acontecendo **por seleção efetivada**, nunca por aplicação de cor
