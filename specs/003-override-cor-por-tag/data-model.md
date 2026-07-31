# Data Model: Override de cor por tag do tema

**Feature**: 003-override-cor-por-tag | **Data**: 2026-07-31

Três entidades, nenhuma com estado próprio. A feature inteira é uma função pura
entre elas.

---

## `MapeamentoDeTag`

A associação declarada pelo operador. Vem da configuração, é lida uma vez na
subida e não muda em execução.

| Campo | Tipo | Regra |
|---|---|---|
| `tag` | `string` | Não vazia depois de aparadas as pontas |
| `cor` | `Cor` | Componentes 0–255 inteiros. Preto é válido (FR-003) |

A comparação normaliza os dois lados para **NFC** antes de aparar pontas e baixar
a caixa (FR-006a). Sem isso, `café` gravado em duas formas Unicode seria duas tags
distintas, visualmente idênticas — a medição está em
[research.md §5](research.md#5-duas-grafias-do-mesmo-acento-são-a-mesma-tag).
Acento continua contando: `ceu` não casa com `céu`.

`Cor` é o tipo que já existe em `src/core/state.ts` — não há tipo de cor novo
nesta feature.

**A coleção é uma sequência ordenada, não um conjunto.** A ordem é a regra de
precedência (FR-007), o que a torna dado significativo e não detalhe de
armazenamento. Daí o formato ser array: ver
[research.md §1](research.md#1-que-formato-preserva-a-ordem-declarada-inclusive-para-tags-só-de-dígitos)
para a medição que descartou o objeto.

### Invariante de carga (FR-004)

Duas entradas cujas tags casem entre si sob a regra de FR-006 **e FR-006a** —
`"Azul"` e `" azul "`, ou as duas formas Unicode de `"café"` — são **erro de
configuração**, recusado na subida, com as duas nomeadas na mensagem.

O caso Unicode é o que torna a mensagem difícil: as duas tags conflitantes
aparecem idênticas na tela. A mensagem precisa dizer que o conflito é de forma
Unicode, ou o operador olhará duas linhas iguais sem entender a acusação. A alternativa seria uma delas vencer sempre e a
outra nunca, sem nada explicando por quê.

---

## `Casamento`

O veredito de um tema contra o mapeamento. Existe por ciclo, não é guardado.

```
Casamento =
  | { tipo: 'sem_mapeamento' }
  | { tipo: 'sem_tema' }
  | { tipo: 'sem_tags' }
  | { tipo: 'nenhuma_mapeada';  tags: readonly string[] }
  | { tipo: 'mapeada';  tag: string;  cor: Cor;  preteridas: readonly string[] }
```

Os cinco casos não são simetria decorativa — cada um responde a um requisito
diferente e produz consequência diferente:

| Caso | Quando | O que causa |
|---|---|---|
| `sem_mapeamento` | Seção ausente ou vazia | Caminho de antes desta feature, intocado (FR-002) |
| `sem_tema` | Sem apresentação, ou tema nunca lido | Sem override. Sem apresentação, nem a extração é anunciada e o repouso da 002 continua mandando (FR-014, FR-014a) |
| `sem_tags` | Tema existe, `tags: []` | Extração vale. Não é caso especial |
| `nenhuma_mapeada` | Tema tem tags, nenhuma casa | Extração vale, **e as tags vão ao log** (FR-017) |
| `mapeada` | Ao menos uma casa | Cor declarada substitui (FR-008) |

`sem_tags` e `nenhuma_mapeada` são separados de propósito: o primeiro é o estado
normal de quem não usa a feature, e registrá-lo encheria o log de ruído; o
segundo é o sintoma de tag digitada diferente nos dois lados, que é justamente o
que precisa aparecer (SC-005).

`preteridas` traz as demais tags mapeadas do mesmo tema, na ordem em que
apareceriam, para o log de empate de FR-007b. Vazia quando só uma casou.

---

## `CorEfetiva`

O que sai da resolução e entra na decisão de anúncio.

| Campo | Tipo | Nota |
|---|---|---|
| `cor` | `Cor` | A declarada quando `mapeada`; a extraída nos demais casos |
| `origem` | `'extraida' \| 'mapeada'` | Vai ao evento e ao log (FR-015) |
| `tag` | `string \| null` | A tag responsável. `null` quando `extraida` |
| `extraída` | `Cor \| null` | O que a extração calculou. `null` quando não houve leitura válida (FR-008a) |

`extraída` sobreviver ao override é requisito, não conveniência: é o que permite
ao operador julgar depois se ainda precisa do mapeamento. Sem ela, remover um
override viraria aposta.

**`null` é estado alcançável, e só de um jeito**: override ativo num ciclo em que
a leitura de cor falhou ou a região configurada não existia (FR-008a). Nesse caso
a cor declarada segue para o palco e o registro diz que não houve extração — que é
informação diferente de "a extração coincidiu com a declarada", e por isso não
pode ser representada pelo mesmo valor.

Com `origem: 'extraida'`, `extraída` **nunca** é `null`: sem extração e sem
mapeamento não há cor efetiva nenhuma, e a resolução devolve `null` inteiro em vez
de uma `CorEfetiva` incompleta.

### A resolução pode não devolver nada

`resolverCorEfetiva` devolve `CorEfetiva | null`. O `null` cobre o único caso em
que não há o que anunciar: **sem extração válida e sem override**. Antes desta
feature esse caso era expresso por não entrar no bloco de cor; agora é um valor,
o que o torna testável sem simular o ciclo inteiro.

---

## Onde cada coisa mora

```
src/core/override.ts     casarTag, resolverCorEfetiva  ← puro, nasce de teste
src/core/state.ts        aplicarCiclo chama a resolução antes de avaliarCor
src/core/presentation.ts diferençaDeContexto devolve o casamento junto do tema
src/core/events.ts       cor_anunciada e tema_trocado ganham campos
src/adapters/config.ts   esquema da seção + invariante de carga
src/adapters/logger.ts   imprime origem, empate e tags não mapeadas
```

Nenhum arquivo novo fora de `core/`, e nenhuma pasta nova. `src/service/` não é
tocado: a feature não acrescenta I/O, consulta, relógio nem modo de falha.

## Fluxo de um ciclo

```
leitura do Holyrics
   │
   ├─ diferençaDeContexto ──► item, tema, casamento, eventos de contexto
   │
   ├─ sabidamente sem apresentação? ──sim──► nada. Repouso da 002 (FR-014a)
   │                              │
   │                             não
   │                              │
   ├─ selecionarRegiao ──► cor extraída, ou NULL se falhou (FR-008a)
   │                              │
   ├─ resolverCorEfetiva(extraída, casamento) ──► efetiva + origem, ou NULL
   │                              │
   │                        NULL? ──► nada a anunciar
   │                              │
   └─ avaliarCor(estado, EFETIVA) ──► anúncio ou silêncio
                                  │
                                  └─► cor_anunciada, agora com origem
```

Duas setas importam, e por motivos opostos:

- **`avaliarCor` recebe a efetiva.** É só isso que faz FR-010 e FR-011 valerem sem
  tocar no mecanismo anti-flicker.
- **A extração pode ser `null` e o fluxo continua**, mas "sem apresentação" corta
  antes de tudo. As duas condições eram vizinhas no mesmo `if` antes desta
  feature, e a spec ganhou FR-014a justamente porque afrouxar uma convida a
  afrouxar a outra.

O rastreamento ciclo a ciclo está em
[research.md §2](research.md#2-entre-quais-fronteiras-a-substituição-entra-no-pipeline-da-001).

## O que NÃO entra no estado

`EstadoDoServiço` **não** ganha campo. Nem a tag vigente, nem a origem da cor
corrente, nem o mapeamento.

A tentação existe — guardar "estou em override pela tag X" pareceria útil para o
log. Mas o tema já está no estado, e o mapeamento é constante: o veredito é
função dos dois e pode ser recalculado a qualquer momento. Guardá-lo criaria uma
segunda fonte de verdade capaz de divergir da primeira, que é o defeito que esta
feature existe para evitar em outro lugar.
