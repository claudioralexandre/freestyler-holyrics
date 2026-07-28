# Phase 1 — Data Model: Leitura de cor do Holyrics

**Feature**: 001-leitura-cor-holyrics | **Data**: 2026-07-28

Nada aqui é persistido. Todas as estruturas vivem em memória durante a execução
do serviço. Os tipos abaixo descrevem forma e regra, não implementação.

---

## Visão geral

```
Holyrics ──▶ Leitura do ciclo ──▶ [ núcleo puro ] ──▶ Eventos ──▶ consumidor
                                        │                       └──▶ log
                                        ▼
                                 Estado do serviço
```

O núcleo é uma única transição:

```
aplicarCiclo(estado, leituraDoCiclo) → { estado: EstadoDoServiço, eventos: Evento[] }
```

Sem relógio, sem I/O, sem log. O horário entra como campo da leitura, não como
chamada a `Date.now()` (Princípio II).

---

## Entidades de entrada

### `LeituraDoCiclo`

O resultado consolidado de um ciclo, já traduzido pelo adaptador. Cada consulta é
independente (FR-004a), então cada uma carrega seu próprio sucesso ou falha.

| Campo | Tipo | Notas |
|---|---|---|
| `momento` | timestamp | Injetado pelo chamador. O núcleo nunca lê o relógio. |
| `cor` | `Resultado<LeituraDeCor>` | De `GetColorMap` |
| `item` | `Resultado<ItemEmExibição \| null>` | De `GetCurrentPresentation`. `null` = sem apresentação |
| `tema` | `Resultado<Tema \| null>` | De `GetCurrentTheme`. Observação apenas (FR-005b) |

### `Resultado<T>`

```
{ ok: true, valor: T } | { ok: false, motivo: MotivoDeFalha }
```

**Regra**: `ok: false` numa consulta MUST NOT invalidar as outras (FR-004a). O
núcleo trata cada campo isoladamente.

### `MotivoDeFalha`

| Valor | Significado | Efeito na disponibilidade (FR-004c) |
|---|---|---|
| `indisponivel` | Conexão recusada, timeout, host inalcançável | Conta para queda se todas falharem |
| `credencial_recusada` | Token rejeitado | Conta para queda; log distinto (FR-017) |
| `resposta_invalida` | Respondeu, mas fora do contrato | Falha parcial |
| `regiao_inexistente` | Índice configurado fora do array recebido (FR-002a) | Falha parcial |

### `LeituraDeCor`

O array de 8 posições devolvido pelo Holyrics, já validado.

| Campo | Tipo | Regra |
|---|---|---|
| `regiões` | `Cor[]` | Exatamente 8 posições esperadas; comprimento real é registrado |

### `Cor`

| Campo | Tipo | Regra |
|---|---|---|
| `r`, `g`, `b` | inteiro | 0–255 cada. Fora da faixa → `resposta_invalida` |

`hex` vem na resposta do Holyrics mas é redundante; o núcleo usa os componentes.

### `ItemEmExibição`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | texto | Identidade do item. É o que define troca de item (FR-010) |
| `tipo` | texto | `song`, `verse`, `text`, `image`… Não altera comportamento |
| `nome` | texto | Pode vir vazio; usado só em log |
| `slide` | inteiro | Posição atual. Define evento de slide (FR-010a) |
| `totalDeSlides` | inteiro | Contexto da posição (FR-010d) |

### `Tema`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | texto | Identidade; define troca de tema |
| `nome` | texto | Log |
| `tags` | texto[] | Registradas para calibração futura. Nunca influenciam cor (FR-005b) |

---

## Estado do serviço

### `EstadoDoServiço`

O valor que atravessa os ciclos. Serializável, comparável, sem métodos.

| Campo | Tipo | Ausente quando |
|---|---|---|
| `corDeReferência` | `Cor \| null` | Antes da primeira leitura, ou em "sem apresentação" (FR-012) |
| `candidata` | `Cor \| null` | Nenhuma mudança em avaliação |
| `ciclosDeConfirmação` | inteiro | Zero fora de uma avaliação (FR-007b) |
| `item` | `ItemEmExibição \| null` | Sem apresentação |
| `tema` | `Tema \| null` | Sem tema |
| `últimoSucesso` | por consulta | Nunca leu com sucesso ainda |

`últimoSucesso` guarda um timestamp **por consulta** (cor, item, tema), não um
único — é o que permite distinguir "não mudou" de "não é lido há dez minutos"
(FR-013a e o edge case de falha parcial prolongada).

### O que deliberadamente NÃO está aqui: disponibilidade

`EstadoDoServiço` **não** tem campo de disponibilidade do Holyrics, embora a
FR-013a exija que ela apareça na consulta de estado.

**Motivo**: disponibilidade é conclusão sobre rede, não sobre conteúdo. Ela
depende de saber se *todas* as consultas do ciclo falharam (FR-004c) e de contar
falhas consecutivas para o backoff — coisas do adaptador e do loop, não do
núcleo. Enfiá-la em `EstadoDoServiço` traria conhecimento de rede para dentro do
núcleo puro, contra o Princípio II.

**Onde ela vive**: `src/service/availability.ts`, como estado próprio do serviço.

**Como as duas se juntam**: `snapshot()` em `src/service/runtime.ts` **compõe** o
estado do núcleo com o estado de disponibilidade do serviço, e é essa composição
que satisfaz a FR-013a. O núcleo nunca vê o resultado composto — ver
[contracts/events.md](contracts/events.md).

### Invariantes

1. `corDeReferência === null` ⟺ não há apresentação **ou** nenhuma leitura de cor
   válida ocorreu ainda.
2. `candidata !== null` ⟹ `ciclosDeConfirmação >= 1`.
3. `ciclosDeConfirmação` nunca atinge o valor configurado sem que um evento de
   cor seja emitido no mesmo ciclo.
4. `item === null` ⟹ `corDeReferência === null` (FR-012). A recíproca é falsa: no
   arranque pode haver item conhecido e cor ainda não lida.

---

## Ciclo de vida da cor

```
        ┌──────────────────┐
        │  sem referência  │◀────── entra em "sem apresentação" (FR-012)
        └────────┬─────────┘
                 │ primeira leitura válida
                 │ → anuncia imediatamente (FR-009a)
                 ▼
        ┌──────────────────┐
   ┌───▶│    estável       │
   │    └────────┬─────────┘
   │             │ leitura com ΔE > limiar
   │             ▼
   │    ┌──────────────────┐
   │    │   confirmando    │──── leitura com ΔE ≤ limiar ──┐
   │    │  (contador < N)  │     → zera contador (FR-007b) │
   │    └────────┬─────────┘◀──────────────────────────────┘
   │             │ contador atinge N
   │             │ → anuncia; referência = última leitura (FR-009)
   └─────────────┘
```

**Detalhe da FR-007c**: durante `confirmando`, as leituras candidatas não
precisam ser parecidas entre si — a comparação é sempre contra
`corDeReferência`. É por isso que a referência que se adota ao final é a
**última** leitura da sequência, não a que iniciou a contagem.

## Ciclo de vida do item e do slide

| Transição observada | Eventos emitidos |
|---|---|
| `null` → item | `apresentacao_iniciada` |
| item → `null` | `apresentacao_encerrada` + descarte da referência de cor |
| item A → item B | `item_trocado` apenas — nunca acompanhado de `slide_mudou` (FR-010c) |
| mesmo item, slide muda | `slide_mudou` apenas |
| mesmo item, mesmo slide | nenhum |
| item sem noção de slide | nenhum `slide_mudou` |
| `totalDeSlides` muda sozinho | nenhum evento; valor atualizado |

**Regra de precedência**: a identidade do item é avaliada antes da posição. Se o
`id` mudou, o ciclo emite `item_trocado` e ignora a diferença de `slide`, mesmo
que ela exista.

---

## Validação de entrada

Aplicada no adaptador, antes de o núcleo ver qualquer coisa:

| Regra | Violação produz |
|---|---|
| Envelope tem `status: "ok"` e `data` presente | `resposta_invalida` |
| `data` de cor é array | `resposta_invalida` |
| Índice configurado existe no array | `regiao_inexistente` |
| Componentes de cor são inteiros 0–255 | `resposta_invalida` |
| `data` de apresentação é objeto ou `null` | `resposta_invalida` |
| `slide` e `total_slides` são inteiros quando presentes | `resposta_invalida` |

O núcleo assume entrada já validada. Essa é a fronteira: adaptador desconfia,
núcleo confia.
