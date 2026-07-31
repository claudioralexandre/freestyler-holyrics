# Contrato: delta nos eventos

**Feature**: 003-override-cor-por-tag

Estende [o contrato de eventos da 001](../../001-leitura-cor-holyrics/contracts/events.md).
**Nenhum evento novo, nenhum removido, ordem de entrega inalterada.** Dois
eventos ganham campo.

Como diz o contrato original, isto não é interface pública: o consumidor mora no
mesmo processo e no mesmo repositório, então muda junto com quem consome, sem
versionamento.

---

## `cor_anunciada` — ganha a origem

```
+ origem:   'extraida' | 'mapeada'
+ tag:      string | null      // a tag responsável; null quando extraida
+ extraída: Cor | null         // o que a extração calculou; null se ela falhou
```

Os campos existentes — `cor`, `anterior`, `motivo`, `deltaE` — não mudam de
significado. `cor` continua sendo a cor que segue para o palco; com override
ativo, ela é a declarada.

`extraída` vem preenchida **também** quando `origem` é `mapeada` (FR-009). É o
que permite ao operador avaliar depois se ainda precisa do override — sem esse
campo, remover um mapeamento viraria aposta.

Com `origem: 'extraida'`, `cor` e `extraída` são a mesma cor, e `extraída`
**nunca** é `null`. A redundância é deliberada: o consumidor lê um campo só, e o
log não precisa de condicional para formar a linha.

### Quando `extraída` é `null`

Só numa combinação: `origem: 'mapeada'` num ciclo em que a leitura de cor falhou
ou a região configurada não existia (FR-008a). O override não depende da extração,
então a cor declarada segue para o palco e o registro diz que não houve extração.

`null` aqui é informação, não ausência de informação: significa "a extração
falhou neste ciclo", que é diferente de "a extração coincidiu com a declarada". O
log não pode representar as duas com o mesmo valor.

> **Consumidores**: a 002 lê `cor` e ignora o resto. Ela não pergunta de onde a
> cor veio e não passa a perguntar (ver [plan.md](../plan.md)).

## `tema_trocado` — ganha o veredito

```
+ casamento: Casamento     // o veredito do tema que ENTROU
```

`Casamento` está definido no [modelo](../data-model.md#casamento). É o mesmo
valor que decidiu a cor efetiva no ciclo — calculado uma vez, não duas, para que
não haja como o log e a decisão discordarem.

O que cada caso produz no log:

| `casamento.tipo` | Linha |
|---|---|
| `mapeada`, sem preteridas | Tag vencedora e cor declarada |
| `mapeada`, com preteridas | Idem, **mais** o aviso de empate com as preteridas (FR-007b) |
| `nenhuma_mapeada` | As tags observadas, como não mapeadas (FR-017) |
| `sem_tags`, `sem_tema`, `sem_mapeamento` | Nada além da linha de tema que já existia |

`sem_tags` não gera linha de propósito: é o estado normal de quem não usa a
feature, e registrá-lo encheria o log de ruído em todo culto — enquanto
`nenhuma_mapeada` é o sintoma de tag digitada diferente nos dois lados, que
precisa aparecer (SC-005).

---

## O que não muda

- **A ordem de entrega.** `tema_trocado` continua vindo antes de `cor_anunciada`
  no mesmo ciclo, o que significa que um consumidor que reaja à cor já viu o
  veredito do tema.
- **`item_trocado` e `slide_mudou`.** O override é do tema (FR-013). Trocar de
  música ou de estrofe dentro do mesmo tema não muda cor por esta via, e a emenda
  ao FR-003 da 002 preserva palavra por palavra a parte sobre `item_trocado`.
- **Os eventos de disponibilidade.** `holyrics_perdido` e `holyrics_recuperado`
  seguem intocados: perder a leitura não é perder o override, porque o tema
  permanece no estado.
- **`apresentacao_encerrada`.** Continua descartando a cor de referência, e
  nenhuma cor é anunciada enquanto não houver apresentação — nem mapeada
  (FR-014a). A dispensa de leitura concedida por FR-008a **não** chega aqui.
