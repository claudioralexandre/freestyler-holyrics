# Phase 1 — Modelo de dados

**Feature**: 002-saida-dmx-freestyler | **Data**: 2026-07-29

Tudo aqui vive em memória. Não há persistência: reiniciar o serviço zera o
estado, e é isso que FR-027 assume ao esperar a primeira cor.

---

## Entidades

### `Cor`

Reaproveitada da 001 (`src/core/state.ts`): componentes `r`, `g`, `b` inteiros
0–255. Não há tipo novo.

### `InventárioDoFreestyler`

O que a mesa responde quando perguntada. Lido na subida e a cada reconexão
(FR-011), nunca declarado em arquivo.

| Campo | Tipo | Origem |
|---|---|---|
| `versão` | `string` | `FSBC010000` |
| `grupos` | `readonly string[]` | `FSBC008000` — posição no array = posição do grupo |
| `fixtures` | `readonly string[]` | `FSBC017000` |
| `endereços` | `readonly number[]` | `FSBC018000`, posicional com `fixtures` |

`fixtures` e `endereços` **não são usados para comandar**. Existem só para o log
de diagnóstico (FR-025a): é o que permite ao operador conferir que o grupo
configurado contém as luminárias que ele imagina.

### `GrupoResolvido`

Resultado de casar o nome configurado contra `inventário.grupos`.

| Campo | Tipo | Notas |
|---|---|---|
| `nomeConfigurado` | `string` | o que está no JSON |
| `nomeReal` | `string` | como o Freestyler o chama |
| `posição` | `number` | 1-based, detalhe interno (FR-009a) |

A resolução é uma função pura e tem três desfechos:

```
resolverGrupo(nomeConfigurado, grupos) →
  | { ok: true,  valor: GrupoResolvido }
  | { ok: false, motivo: 'nao_encontrado', candidatos: string[] }
  | { ok: false, motivo: 'ambiguo',        candidatos: string[] }
```

`candidatos` alimenta a mensagem de log exigida por FR-010 e FR-009c. Em
`nao_encontrado` traz os nomes existentes; em `ambiguo`, os que casaram.

### `EstadoDaSaída`

O núcleo desta feature. Deliberadamente separa intenção de efeito.

| Campo | Tipo | Significado |
|---|---|---|
| `corPretendida` | `Cor \| null` | o que deveria estar valendo. `null` = nada ainda (FR-027) |
| `últimoConjuntoEscrito` | `Cor \| null` | o que saiu pelo socket sem o TCP reclamar |
| `grupo` | `GrupoResolvido \| null` | `null` enquanto não resolvido |
| `jáHouveCor` | `boolean` | trava de FR-027: falso até o primeiro `cor_anunciada` |

**Por que não há `corAplicada`.** Seria mentira: cor não é confirmável
(FR-015b). A palavra usada em todo o código e no log é *escrita*.

`corPretendida !== últimoConjuntoEscrito` é a condição única de "há envio
pendente" — vale tanto para cor nova (FR-015) quanto para reenvio após falha
(FR-029a) e reaplicação na reconexão (FR-020).

### `EstadoDaDisponibilidade`

| Campo | Tipo | Notas |
|---|---|---|
| `disponível` | `boolean` | conclusão corrente |
| `últimoPulso` | `number \| null` | timestamp do último `0xFF` |
| `jáAvaliado` | `boolean` | evita transição falsa no primeiro ciclo |

Mesmo desenho de `src/service/availability.ts` da 001, e pela mesma razão: o
primeiro ciclo deve registrar o estado encontrado, não fingir que nada mudou. Foi
o defeito de usabilidade que a 001 só revelou em teste ponta a ponta.

---

## Transições

### Núcleo puro: duas funções, não uma

> **Corrigido em 2026-07-29 (achado D1 da análise).** O desenho anterior tinha
> uma função só, `decidirEnvio(estado, evento, parâmetros)`, que deveria produzir
> a ação `garantir_selecao` — decisão que **depende do status dos grupos lido da
> mesa**, e esse status não entrava por parâmetro nenhum. A função não tinha como
> decidir uma das três ações que devia produzir.
>
> A correção separa o que acontece em momentos diferentes: o evento chega sem
> que ninguém tenha lido a mesa; a leitura só acontece quando há trabalho a fazer.

#### 1. `aplicarEvento` — do evento para a intenção

```
aplicarEvento(estado, evento) → estado
```

Pura, sem noção de rede. Só atualiza `corPretendida` e `jáHouveCor` conforme o
mapa abaixo. Não decide envio, não conhece o status da mesa.

#### 2. `planejarEnvio` — da intenção para as ações

```
planejarEnvio(estado, mesa, parâmetros) → ações
```

Onde `mesa` é o que foi lido do Freestyler **neste instante**, ou `null` se ainda
não se leu nada:

```
type LeituraDaMesa = {
  readonly grupos: readonly string[]        // FSBC008000
  readonly statusDosGrupos: readonly boolean[]  // FSBC009000
}
```

`ações` é uma lista ordenada, possivelmente vazia:

| Ação | Quando |
|---|---|
| `ler_mesa` | há divergência entre pretendida e escrita, e `mesa` é `null` |
| `resolver_grupo` | `mesa` lida e `estado.grupo` ainda `null` (FR-011a) |
| `garantir_selecao` | grupo resolvido e `statusDosGrupos[posição - 1] === false` (FR-012a) |
| `confirmar_selecao` | logo após `garantir_selecao` (FR-015c) |
| `escrever_cor` | grupo resolvido, seleção confirmada, e `corPretendida !== últimoConjuntoEscrito` |

Com `jáHouveCor === false`, `planejarEnvio` devolve **lista vazia** sempre,
qualquer que seja o resto do estado (FR-027).

Nenhuma ação é executada pelo núcleo. Ele diz o que fazer; `service/saida-dmx.ts`
faz, e realimenta o resultado. O tempo, quando necessário, entra por
`parâmetros`, nunca via `Date.now()`.

### Mapa de evento para intenção

| Evento consumido | Efeito em `corPretendida` |
|---|---|
| `cor_anunciada` | vira a cor do evento; `jáHouveCor` passa a `true` |
| `apresentacao_encerrada` | vira a cor de repouso — **só se** `jáHouveCor` (FR-027a) |
| `holyrics_perdido` | inalterada (FR-005) |
| `apresentacao_iniciada`, `item_trocado`, `slide_mudou`, `tema_trocado` | inalterada (FR-003, FR-006) |

### Disponibilidade por heartbeat

```
avaliarPulso(estado, momento, janelaMs) → { estado, evento? }
```

`disponível = momento - últimoPulso <= janelaMs`. Transição emite evento uma vez
(FR-021), nunca a cada avaliação.

---

## Invariantes

1. `últimoConjuntoEscrito` só avança quando **todos** os comandos do envio saíram
   (FR-029). Falha parcial mantém o valor anterior, e a divergência dispara
   reenvio.
2. `corPretendida` nunca é `null` depois do primeiro `cor_anunciada` — passa a
   alternar entre cor do evento e cor de repouso.
3. `grupo` só é `null` antes da primeira resolução bem-sucedida ou após uma
   reconexão que o invalidou.
4. Nenhuma ação de luz é possível com `jáHouveCor === false`. É a trava de
   FR-027, e é verificável por teste sem Freestyler.
5. O núcleo nunca conhece socket, timer ou log. `aplicarEvento` recebe estado e
   evento e devolve estado; `planejarEnvio` recebe estado e uma leitura da mesa e
   devolve ações. Nenhuma das duas executa nada.
6. `planejarEnvio` é **idempotente em relação ao status**: chamada duas vezes com
   o mesmo `mesa`, produz as mesmas ações. É o que impede o toggle de ser enviado
   duas vezes e apagar a luz (FR-012a).
