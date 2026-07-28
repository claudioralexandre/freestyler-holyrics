# Contrato exposto: eventos e estado em memória

**Feature**: 001-leitura-cor-holyrics | **Data**: 2026-07-28

Este é o único contrato que a feature **oferece**. Ele é consumido dentro do
mesmo processo, por assinatura direta (FR-013). Não há canal de rede, arquivo de
estado nem formato de mensagem publicado — decisão registrada na spec e em
[research.md](../research.md).

> **Não é um contrato público.** Como o consumidor mora no mesmo processo e no
> mesmo repositório, este contrato pode mudar junto com quem o consome, sem
> versionamento nem compatibilidade retroativa. Se um dia houver segundo
> processo, é aqui que o canal nasce — e aí ele passa a ser público.

---

## Assinatura

```
subscribe(ouvinte: (evento: Evento) => void): () => void
```

Devolve uma função que cancela a inscrição.

**Regras**:

- O serviço opera normalmente sem nenhum inscrito (FR-013b). Os eventos continuam
  indo para o log.
- Uma exceção lançada pelo ouvinte é capturada, registrada e descartada. Não
  interrompe o ciclo nem derruba o processo (FR-013c).
- Os eventos de um mesmo ciclo são entregues na ordem definida abaixo.

## Ordem de entrega dentro de um ciclo

Quando um ciclo produz mais de um evento, a ordem é fixa:

1. `holyrics_perdido` / `holyrics_recuperado`
2. `apresentacao_encerrada`
3. `apresentacao_iniciada`
4. `item_trocado`
5. `slide_mudou`
6. `tema_trocado`
7. `cor_anunciada`

**Rationale**: o contexto chega antes do conteúdo. Um consumidor que reaja à cor
já sabe, no momento da entrega, em que item e tema ela ocorreu. `cor_anunciada`
vem por último por ser o evento que a feature de saída vai transformar em luz.

---

## Eventos

Todo evento carrega `momento` (timestamp do ciclo que o produziu).

### `cor_anunciada`

Emitido quando o núcleo adota uma nova cor de referência.

| Campo | Notas |
|---|---|
| `cor` | Componentes r/g/b, 0–255 |
| `anterior` | Cor de referência anterior, ou ausente na primeira |
| `motivo` | `primeira_leitura` (FR-009a) ou `mudanca_confirmada` (FR-007a) |

**Não é emitido** por troca de item cuja cor não ultrapasse o limiar (FR-012a).

### `item_trocado`

| Campo | Notas |
|---|---|
| `anterior` | Item anterior, ou ausente se vinha de "sem apresentação" |
| `atual` | Novo item |

Nunca acompanhado de `slide_mudou` no mesmo ciclo (FR-010c).

### `slide_mudou`

Emitido apenas quando o item permanece o mesmo e a posição muda.

| Campo | Notas |
|---|---|
| `de` / `para` | Posições anterior e nova |
| `total` | Total de slides do item (FR-010d) |

Avanço e retrocesso produzem o mesmo evento; a direção é inferível de `de`/`para`.

### `apresentacao_iniciada` / `apresentacao_encerrada`

Transições entre "com apresentação" e "sem apresentação" (FR-011).
`apresentacao_encerrada` implica descarte da cor de referência (FR-012), de modo
que a primeira cor após o retorno virá com `motivo: primeira_leitura`.

### `tema_trocado`

| Campo | Notas |
|---|---|
| `anterior` / `atual` | Tema, com `id`, `nome` e `tags` |

Informativo. **Nunca influencia a cor anunciada** (FR-005b).

### `holyrics_perdido` / `holyrics_recuperado`

Transições de disponibilidade (FR-016). Emitidos **uma vez por transição**, não a
cada tentativa.

| Campo | Notas |
|---|---|
| `causa` | `indisponivel` ou `credencial_recusada` (FR-017) |

`holyrics_perdido` só ocorre quando **todas** as consultas do ciclo falham
(FR-004c). Falha isolada de uma consulta não gera evento — vai só para o log.

---

## Estado consultável

```
snapshot(): EstadoObservável
```

Devolve uma cópia do estado corrente a qualquer momento (FR-013a). Chamar
`snapshot()` não altera nada.

**É uma composição, não um espelho.** `snapshot()` junta duas fontes:

| Campo | Origem |
|---|---|
| `corDeReferência`, `item`, `slide`, `totalDeSlides`, `tema`, `últimoSucesso` | `EstadoDoServiço`, do núcleo puro ([data-model.md](../data-model.md)) |
| `holyricsDisponível` | Estado de `src/service/availability.ts` |

A disponibilidade é conclusão sobre rede e por isso não entra no núcleo
(Princípio II). `runtime.ts` é o único lugar onde as duas se encontram.

| Campo | Ausente quando |
|---|---|
| `corDeReferência` | Sem apresentação, ou antes da primeira leitura válida |
| `item` | Sem apresentação |
| `slide` / `totalDeSlides` | Sem apresentação, ou item sem noção de slide |
| `tema` | Sem tema |
| `holyricsDisponível` | Nunca ausente — é booleano |
| `últimoSucesso.cor` | Nunca leu cor com sucesso |
| `últimoSucesso.item` | Nunca leu item com sucesso |
| `últimoSucesso.tema` | Nunca leu tema com sucesso |

Os três horários de `últimoSucesso` são separados de propósito: é o que permite
distinguir "a cor não mudou" de "a cor não é lida há dez minutos" durante uma
falha parcial prolongada.
