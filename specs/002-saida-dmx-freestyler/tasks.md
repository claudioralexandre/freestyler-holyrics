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

- [ ] T001 Criar `tests/fixtures/freestyler-responses.ts` com as respostas **reais** capturadas do FreeStyler 4.1.7, transcritas de [contracts/freestyler.md](contracts/freestyler.md): versão, nomes de grupos, status de grupos, nomes de fixtures, endereços e fixtures selecionadas
- [ ] T002 [P] Estender `config/config.example.json` com o bloco `freestyler` conforme [contracts/config.md](contracts/config.md), com comentário explicando que `grupo` é o nome tal como aparece no Freestyler

## Phase 2 — Fundação: o formato de fio

Bloqueia tudo o mais. Sem codificar e decodificar corretamente, nenhuma outra
tarefa é verificável.

- [ ] T003 Escrever `tests/unit/protocolo.test.ts` para a **codificação** `FSOC`: código e argumento com zero à esquerda em 3 casas; `FSOC002255` blackout; `FSOC130255` e `FSOC130000` slot de cor; `FSOC036255` grupo 3; código de 3 dígitos acima de 99 (grupo 11 = 550). Confirmar RED
- [ ] T004 Implementar a codificação `FSOC` em `src/adapters/freestyler/protocolo.ts`
- [ ] T005 Escrever em `tests/unit/protocolo.test.ts` os testes de **decodificação** `FSBC`: envelope `FSBC` + byte de contagem + `,` + valores; lista de nomes com posições vazias; lista de inteiros; valor único (versão, master intensity); resposta truncada ou fora de formato vira falha, nunca exceção. Confirmar RED
- [ ] T006 Implementar a decodificação `FSBC` em `src/adapters/freestyler/protocolo.ts`
- [ ] T007 Escrever teste de que o heartbeat `0xFF` **não** é confundido com resposta de consulta (FR-021c). Confirmar RED, depois implementar a separação em `protocolo.ts`

## Phase 3 — US1: a luz assume a cor do telão (P1)

**Objetivo**: `cor_anunciada` vira cor nas fixtures do grupo seguidor.

**Teste independente**: injetar `cor_anunciada` no runtime da 001 e observar o
grupo assumir a cor, sem Holyrics.

### Núcleo — resolução de grupo

- [ ] T008 [US1] Escrever `tests/unit/grupo.test.ts` para `resolverGrupo`: casa exato; casa ignorando caixa; casa ignorando espaço nas pontas; **não** casa ignorando acento (FR-009b); `nao_encontrado` com a lista de candidatos (FR-010); `ambiguo` quando dois grupos casam (FR-009c); ignora posições vazias do array de 24. Confirmar RED
- [ ] T009 [US1] Implementar `resolverGrupo` em `src/core/grupo.ts` (FR-008, FR-009a)

### Núcleo — a semântica de toggle

- [ ] T010 [US1] Escrever em `tests/unit/grupo.test.ts` os testes de `precisaSelecionar`: grupo já ativo no status → **não** enviar; grupo inativo → enviar; outro grupo ativo → enviar apenas o nosso, nunca desativar o outro (FR-012a-2); chamada duas vezes com o mesmo status produz o mesmo resultado (FR-012a-1). Confirmar RED
- [ ] T011 [US1] Implementar `precisaSelecionar` em `src/core/grupo.ts` (FR-012a)

> **Tarefa de maior risco da feature.** A versão errada — enviar sempre "por
> garantia" — apagaria a luz em toda aplicação par, e o sintoma no palco seria
> luz piscando sem causa aparente. Ver [research.md](research.md) §3.

### Núcleo — do evento para a intenção

- [ ] T012 [US1] Escrever `tests/unit/saida.test.ts` para `aplicarEvento`: `cor_anunciada` define `corPretendida` e marca `jáHouveCor` (FR-002); `tema_trocado`, `item_trocado`, `apresentacao_iniciada` e `slide_mudou` **não** alteram `corPretendida` (FR-003, FR-006); `holyrics_perdido` mantém a cor (FR-005). Confirmar RED
- [ ] T013 [US1] Implementar `aplicarEvento` em `src/core/saida.ts` — pura, sem noção de rede (FR-015a)

### Núcleo — da intenção para as ações

- [ ] T014 [US1] Escrever em `tests/unit/saida.test.ts` os testes de `planejarEnvio`: sem divergência entre pretendida e escrita → lista vazia (FR-015); com divergência e `mesa === null` → `ler_mesa`; com `mesa` lida e grupo `null` → `resolver_grupo`; grupo resolvido e inativo → `garantir_selecao` seguido de `confirmar_selecao` (FR-015c); tudo resolvido → `escrever_cor`. Confirmar RED
- [ ] T015 [US1] Implementar `planejarEnvio` em `src/core/saida.ts`, devolvendo só a lista de ações, sem executar nada (Princípio II)
- [ ] T016 [US1] Escrever teste de que uma aplicação de cor produz um **número fixo e pequeno** de comandos — seleção mais um por slot — e que esse número **não cresce** com o tamanho do grupo (FR-014). Confirmar RED, depois ajustar se necessário
- [ ] T017 [US1] Escrever teste de que `planejarEnvio` **nunca** produz ação de restaurar seleção anterior, qualquer que seja o status lido (FR-012c). Confirmar RED

### Configuração

- [ ] T018 [US1] Escrever em `tests/unit/config.test.ts` as validações novas: `corDeRepouso` exigida quando há `grupo` (FR-026a); **preto é valor válido** (FR-026b); `corDeRepouso` é única, não aceita por fixture (FR-026d); `heartbeatTimeoutMs` mínimo 4500 (FR-021b); `host` e `port` configuráveis com padrão (FR-023); bloco ausente é válido. Confirmar RED
- [ ] T019 [US1] Estender `src/adapters/config.ts` com o schema `zod` do bloco `freestyler`, no mesmo arquivo da 001 (FR-022)

### Adaptador e serviço

- [ ] T020 [US1] Implementar `src/adapters/freestyler/client.ts`: socket TCP sobre `node:net`, `conectar`, `enviar`, `consultar`, `fechar`. Sem regra de negócio, **sem `process.on` global** — o oposto do que a biblioteca faz (Princípio IV)
- [ ] T021 [US1] Implementar `src/service/saida-dmx.ts`: assinar `subscribe()` da 001 (FR-001), chamar `aplicarEvento` e `planejarEnvio`, executar as ações na ordem, com envios serializados (FR-016)
- [ ] T022 [US1] Implementar a execução de `confirmar_selecao`: reler o status e só então escrever cor; seleção não confirmada é falha de envio (FR-015c)
- [ ] T023 [US1] Ligar a saída em `src/main.ts`, atrás da presença do bloco `freestyler` na config
- [ ] T024 [US1] Implementar o log de aplicação de cor em nível detalhado: cor de origem, grupo e valor de cada slot (FR-024, SC-007)

**Checkpoint**: cenário 6 do quickstart. Cobre **SC-001**, **SC-002** e
**SC-007**.

## Phase 4 — US2: o Freestyler fechado não derruba o culto (P2)

- [ ] T025 [US2] Escrever `tests/unit/heartbeat.test.ts` para `avaliarPulso`: dentro da janela → disponível; além da janela → indisponível; transição emite evento **uma vez** (FR-021); primeiro ciclo registra o estado encontrado sem fingir transição (`jáAvaliado`); o pulso **não** conta como confirmação de comando (FR-021c). Confirmar RED
- [ ] T026 [US2] Implementar `avaliarPulso` em `src/core/heartbeat.ts` (FR-021a, FR-021b)
- [ ] T027 [US2] Ligar o heartbeat ao cliente: cada `0xFF` recebido atualiza `últimoPulso`; a avaliação roda em intervalo próprio
- [ ] T028 [US2] Escrever teste de que, na reconexão, é a **cor pretendida** que é reaplicada — não a fila de cores que passaram (FR-020). Confirmar RED
- [ ] T029 [US2] Implementar a reaplicação na reconexão e o backoff, reaproveitando `src/core/backoff.ts` da 001 (FR-018, FR-019)
- [ ] T030 [US2] Implementar o log de transição de disponibilidade, uma linha por transição, nunca por tentativa (FR-021, FR-025)
- [ ] T031 [US2] Escrever teste de que exceção ao processar um evento é capturada e descartada sem interromper o consumo (FR-007). Confirmar RED, depois implementar

**Checkpoint**: cenário 9 do quickstart. Cobre **SC-003** e **SC-004**.

## Phase 5 — US3: sem apresentação, estado definido (P3)

- [ ] T032 [US3] Escrever em `tests/unit/saida.test.ts` os testes da trava de FR-027: com `jáHouveCor === false`, `planejarEnvio` devolve **lista vazia** qualquer que seja o estado; `apresentacao_encerrada` antes da primeira cor não gera repouso. Confirmar RED
- [ ] T033 [US3] Implementar a trava em `src/core/saida.ts` (FR-027)
- [ ] T034 [US3] Escrever testes do repouso depois da primeira cor: `apresentacao_encerrada` leva à `corDeRepouso` (FR-004, FR-027a); cor preta anunciada é aplicada como cor normal, não confundida com repouso (FR-026c). Confirmar RED
- [ ] T035 [US3] Implementar o repouso em `src/core/saida.ts`
- [ ] T036 [US3] Implementar o log de "aguardando a primeira cor" (FR-027b), sem o qual "ainda não houve apresentação" e "integrador quebrado" têm o mesmo sintoma

**Checkpoint**: cenários 5 e 8 do quickstart. Cobre **SC-008** e **SC-011**.

## Phase 6 — US4: o operador descobre por que não funciona (P4)

- [ ] T037 [US4] Escrever teste de que a resolução é retentada enquanto o grupo não for resolvido **e houver cor a aplicar**, e **não** é retentada depois de resolvida (FR-011a). Confirmar RED
- [ ] T038 [US4] Implementar a retentativa em `src/core/saida.ts`, como parte de `planejarEnvio`
- [ ] T039 [US4] Escrever teste de que a falha de resolução é registrada **apenas na mudança de condição**, não a cada tentativa (FR-011b). Confirmar RED
- [ ] T040 [US4] Implementar a supressão de log repetido
- [ ] T041 [US4] Implementar a leitura do inventário na subida e a cada reconexão: versão, grupos, fixtures e endereços (FR-011). A decodificação já está coberta por T005/T006
- [ ] T042 [US4] Implementar o log do inventário em nível normal, com o grupo resolvido destacado (FR-025a)
- [ ] T043 [US4] Implementar as mensagens de grupo não encontrado (FR-010, com a lista dos existentes) e de grupo ambíguo (FR-009c, com os conflitantes), sem derrubar o processo (FR-010a)

**Checkpoint**: cenários 3 e 4 do quickstart. Cobre **SC-006** e **SC-009**.

## Phase 7 — Envio robusto

- [ ] T044 Escrever testes do tudo-ou-nada: falha em qualquer comando do envio **não** avança `últimoConjuntoEscrito` (FR-029); a divergência dispara reenvio mesmo sem queda de conexão (FR-029a). Confirmar RED
- [ ] T045 Implementar o tudo-ou-nada em `src/service/saida-dmx.ts`, com reagendamento em backoff
- [ ] T046 Escrever teste de que cor nova durante envio em curso resulta na cor **mais recente** ao final, descartando intermediárias (FR-017). Confirmar RED
- [ ] T047 Implementar a serialização e o descarte de intermediárias
- [ ] T048 Implementar o log de falha de envio com a divergência entre pretendida e escrita (FR-029b)
- [ ] T049 Implementar o encerramento que **não** comanda nada, aguardando apenas envio em curso (FR-028, FR-028a)
- [ ] T050 [P] **Revisão de vocabulário e de não-requisitos.** Conferir em código, tipos e log que: nada afirma "entregue" ou "aplicada" para cor, só "escrita" (FR-015b); não existe transição temporizada própria (FR-013, FR-013a); não existe intervalo mínimo entre envios (FR-031); não existe restauração de seleção (FR-012c). São requisitos negativos, verificáveis por leitura e não por teste

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

- [ ] T057 [P] Atualizar `README.md`: configuração por nome de grupo, o que aparece no log, e o efeito colateral de a seleção da mesa mudar (FR-012b)
- [ ] T058 [P] Atualizar `CLAUDE.md`: estado das duas features e pendências restantes
- [ ] T059 [P] Atualizar os scripts de operação se a configuração nova exigir passo adicional

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
| **Total** | **59** |
