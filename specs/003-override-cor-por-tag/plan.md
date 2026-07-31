# Implementation Plan: Override de cor por tag do tema

**Branch**: `003-override-cor-por-tag` | **Date**: 2026-07-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-override-cor-por-tag/spec.md`

> **Revisado em 2026-07-31 após `/speckit-clarify`.** Três respostas entraram
> depois da primeira versão: FR-008a, FR-006a e FR-014a. Nenhuma mudou a
> abordagem; duas apertaram fronteiras que estavam implícitas e uma acrescentou
> uma regra de comparação. O que mudou em cada artefato está listado em
> [O que a clarificação moveu](#o-que-a-clarificação-moveu).

## Summary

O operador declara, no arquivo de configuração que já existe, uma lista ordenada
de `tag → cor`. Quando o tema em exibição porta uma tag declarada, a cor
declarada **substitui** a extraída antes de qualquer decisão de anúncio.

A abordagem cabe em uma frase: **substituir cedo, não tarde**. A cor efetiva —
mapeada ou extraída — é a que alimenta o limiar de ΔE e a confirmação por
permanência.

"Cedo" tem duas fronteiras, e elas são **vizinhas no mesmo `if`** do código
atual — `if (leitura.cor.ok && !semApresentação)`. A clarificação abriu uma e
manteve a outra fechada, de propósito:

| Fronteira | Decisão | Requisito |
|---|---|---|
| Leitura de cor falhou, ou região inexistente | O override **vale** — não depende da extração | FR-008a |
| Sabidamente sem apresentação | O override **não vale** — o repouso da 002 manda | FR-014a |

Estarem na mesma condição é a razão de a spec ter ganhado um requisito só para
dizer "esta não". Quem afrouxar a primeira tende a afrouxar a segunda junto, e o
resultado seria acender a luz exatamente no momento em que a 002 decidiu não
comandar nada. As duas viram tarefas separadas.

Com isso, os dois requisitos mais difíceis da spec deixam de exigir código:

- **FR-010** (o override vale mesmo quando a extração não mudaria nada) acontece
  porque, na troca para um tema mapeado, a cor **efetiva** muda ainda que a
  extraída não mude. O mecanismo anti-flicker que já existe detecta a diferença
  sem saber que existe override.
- **FR-011** (sair do override) é o mesmo trajeto ao contrário.
- **US2 cenário 3** (dois temas mapeados para a mesma cor não geram comando) cai
  fora por construção: a efetiva não muda, ΔE é zero, nada é anunciado.

O trajeto foi rastreado ciclo a ciclo em
[research.md §2](research.md#2-entre-quais-fronteiras-a-substituição-entra-no-pipeline-da-001).

Duas decisões vieram de medição, não de preferência, e as duas contrariam o que a
intuição diria:

1. **O mapeamento é array de `{tag, cor}`**, não objeto com a tag na chave, porque
   objeto JSON não preserva a ordem declarada quando a tag é composta de dígitos —
   e a ordem declarada **é** a regra de precedência (FR-007a).
2. **A comparação normaliza a forma Unicode** antes de aparar e baixar a caixa
   (FR-006a). `café` gravado de duas formas são o mesmo texto na tela, strings
   diferentes na memória, e `toLowerCase` não os aproxima. Como a tag é digitada em
   dois programas distintos e a spec faz questão de que acento conte, sem isso o
   override falharia sem deixar pista — nem o log de tag não mapeada ajudaria,
   porque mostraria as duas grafias lado a lado, idênticas aos olhos.

## Technical Context

**Language/Version**: TypeScript sobre Node.js 22 LTS, módulos ESM, executado com
`--experimental-strip-types` (sem passo de build no desenvolvimento)

**Primary Dependencies**: nenhuma nova. `zod` valida a seção, `pino` registra,
`culori` já calcula o ΔE. O `package.json` não muda

**Storage**: `config/config.json` — o mesmo arquivo da 001 e da 002, seção nova
opcional

**Testing**: `vitest`, em `tests/unit/`. Toda a lógica desta feature é pura e
roda sem Holyrics e sem Freestyler

**Target Platform**: serviço headless. Windows no culto, Linux/macOS no
desenvolvimento — esta feature não tem nada de específico de plataforma

**Project Type**: projeto único, serviço de longa duração. Sem frontend, sem
banco

**Performance Goals**: irrelevante por escala. A resolução é uma varredura de
`tags × mapeamentos` por ciclo de 1 s, com ambos os lados na casa da dezena. Não
há orçamento a defender

**Constraints**: **nenhuma consulta nova ao Holyrics** e nenhuma mudança no
intervalo de leitura — o tema com suas tags já é lido a cada ciclo. Nenhum modo
de falha novo: a feature não abre socket, não lê disco em execução e não tem
relógio

**Scale/Scope**: ~4 arquivos de núcleo tocados, 1 criado; 2 adaptadores
estendidos; `src/service/` intocado

## Constitution Check

*GATE: verificado antes da Phase 0 e reavaliado após a Phase 1.*

| Princípio | Situação | Como |
|---|---|---|
| **I — Contratos verificados** | ⚠️ **Atenção, com plano** | Ver abaixo |
| **II — Núcleo puro, bordas finas** | ✅ Passa | A resolução é função pura em `src/core/override.ts`: recebe cor extraída, tema e mapeamentos, devolve cor efetiva e origem. Sem I/O, sem relógio, sem log dentro. Adaptadores só traduzem — o `logger` imprime o veredito, não o calcula |
| **III — Test-first no núcleo** | ✅ Passa | `casarTag` e `resolverCorEfetiva` são núcleo puro, logo nascem de teste que falha primeiro. Inclui as regras de precedência (FR-007), de comparação (FR-006) e o invariante de carga (FR-004) |
| **IV — Degradar sem cair** | ✅ Passa, sem esforço | A feature não acrescenta dependência externa, socket, arquivo lido em execução nem caminho de falha. Holyrics perdido mantém o tema no estado, logo mantém o override — o que já é o comportamento correto (FR-005 da 001) |
| **V — Simplicidade (YAGNI)** | ✅ Passa | Uma tag, uma cor sólida, uma lista. Sem prioridade numérica, sem faixa, sem gradiente, sem recarga a quente, sem combinação de tags. As recusas estão nomeadas em [contracts/config.md](contracts/config.md#o-que-deliberadamente-não-está-aqui) |

### Princípio I — o que está verificado e o que não está

**Verificado** (Holyrics 2.29.1, 2026-07-28): `GetCurrentTheme` devolve `tags`
**sempre**, como array de strings, vazio quando não há tag, nunca ausente.

**Não verificado**: nenhum tema **com** tag foi observado nesta instalação — a
verificação registrou `tags: []` em todos. A capacidade da ferramenta está
confirmada; o **conteúdo** de uma tag, não. Seguem em aberto: se a tag chega como
foi digitada, se o Holyrics preserva acento ao salvar, e se cada tag é uma
entrada da lista em vez de uma string com vírgulas.

Isto **não bloqueia** o desenho, e bloqueá-lo seria errado: a verificação depende
do Holyrics do culto, que é o mesmo gargalo da Phase 8 da 002, e a resposta mais
provável já está tratada pela regra de comparação de FR-006. O que o Princípio I
exige é que a suposição seja marcada **no próprio código**, e é isso que o plano
faz:

1. `casarTag` carrega a marca de suposição não verificada, nomeando as três
   perguntas abertas.
2. O [cenário 0 do quickstart](quickstart.md#cenário-0--como-uma-tag-chega-de-verdade)
   é pré-requisito de todos os cenários com Holyrics, e o achado vai para
   `holyrics-api.md`.
3. A feature traz o próprio instrumento: FR-017 manda registrar as tags
   observadas quando nenhuma casa, então **antes de existir mapeamento algum** é
   essa linha que responde como a tag chegou.

**Resultado do gate**: passa, com a obrigação registrada. Nenhuma entrada na
tabela de Complexity Tracking — não há violação a justificar, há verificação a
executar no momento em que ela é possível.

### Reavaliação pós-Phase 1

Sem mudança. O desenho da Phase 1 **reduziu** a superfície em vez de aumentá-la:
`EstadoDoServiço` não ganha campo, `src/service/` não é tocado, nenhum evento
novo é criado e nenhuma dependência entra. A única adição estrutural é um arquivo
de núcleo puro, que é exatamente onde o Princípio III quer que a lógica esteja.

### Reavaliação pós-clarificação

As três respostas não mexeram em nenhum gate, e uma **melhorou** a posição:

- **FR-008a fortalece o Princípio IV.** Com a leitura de cor falhando, a luz
  passa a manter a cor certa em vez de congelar — degradação mais graciosa do que
  havia antes desta feature, e não menos.
- **FR-014a é um gate que a spec impôs a si mesma.** Não vem da constitution, e
  ainda assim é o requisito de fronteira mais importante da feature. Vale a mesma
  disciplina: uma tarefa própria, com teste próprio.
- **FR-006a não afeta pureza.** `String.prototype.normalize` é determinístico e
  sem I/O, então `casarTag` continua sendo função pura sob o Princípio II.

O único ponto que continua exigindo atenção é o mesmo de antes: o Princípio I
sobre o formato real de uma tag. FR-006a **reduz** essa incerteza — cobre o caso
de o Holyrics gravar o acento noutra forma —, mas não cobre o caso de ele
**remover** o acento, que continua em aberto para o cenário 0.

## Project Structure

### Documentation (this feature)

```text
specs/003-override-cor-por-tag/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — as quatro perguntas
├── data-model.md        # Phase 1 — as três entidades
├── quickstart.md        # Phase 1 — dez cenários, mais o cenário 0
├── contracts/
│   ├── config.md        # A seção coresPorTag
│   └── events.md        # O delta em cor_anunciada e tema_trocado
├── checklists/
│   └── requirements.md  # Já existente
└── tasks.md             # Phase 2 — criado por /speckit-tasks, NÃO por este comando
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── override.ts      # NOVO — casarTag, resolverCorEfetiva. Puro
│   ├── state.ts         # aplicarCiclo: efetiva antes de avaliarCor, e as duas
│                        #   fronteiras de FR-008a/FR-014a no mesmo if
│   ├── presentation.ts  # diferençaDeContexto devolve o casamento junto do tema
│   ├── events.ts        # cor_anunciada e tema_trocado ganham campos
│   ├── stability.ts     # INTOCADO — recebe a efetiva sem saber que existe override
│   ├── color.ts         # INTOCADO
│   └── grupo.ts         # INTOCADO (002)
├── adapters/
│   ├── config.ts        # Esquema da seção + invariante de carga (FR-004)
│   └── logger.ts        # Origem da cor, empate, tags não mapeadas
├── service/             # INTOCADO POR INTEIRO
└── main.ts              # Passa os mapeamentos ao núcleo; log de carga (FR-016)

tests/unit/
├── override.test.ts     # NOVO — o grosso da feature
├── state.test.ts        # Estendido: a efetiva alimenta a decisão
├── presentation.test.ts # Estendido: o casamento acompanha o tema
└── config.test.ts       # Estendido: forma da seção e tags conflitantes

config/config.example.json  # A seção comentada, com a explicação da ordem
```

**Structure Decision**: a estrutura de três camadas da 001 e da 002 se mantém sem
alteração, e a feature entra inteira em `src/core/`. Nada em `src/service/` é
tocado, o que é o sinal de que o desenho está no lugar certo: esta feature é
decisão pura, e decisão pura não tem por que mexer em loop, disponibilidade ou
backoff.

`stability.ts` ficar **intocado** é o segundo sinal. O mecanismo anti-flicker não
aprende a existência do override — ele continua comparando duas cores, e a
substituição acontece antes de ele ser chamado. É o que garante FR-012 sem
esforço de vigilância: não há como abrir exceção para a origem da cor num arquivo
que não sabe que origem existe.

## Emendas às specs anteriores

A spec declara duas emendas e manda corrigir as specs originais **junto** da
implementação, não depois. As duas são de **texto**; nenhuma muda código já
escrito.

| Spec | Requisito | O que muda |
|---|---|---|
| 001 | FR-005b — o tema nunca influencia a cor anunciada | Passa a influenciar quando, e somente quando, uma tag estiver mapeada. Sem mapeamento, o texto original vale palavra por palavra |
| 002 | FR-003 — MUST NOT derivar cor de `tema_trocado` nem de `item_trocado` | A parte sobre `item_trocado` fica intacta. A parte sobre `tema_trocado` cede |

**A 002 não muda de código.** Ela consome `cor_anunciada`, lê o campo `cor` e não
pergunta a origem; continua ignorando `tema_trocado` como sempre ignorou. A
emenda ao FR-003 dela é sobre de onde a cor pode ter vindo antes de chegar, o que
é assunto da 001 e desta feature — não dela.

Vale registrar por que as duas frases originais continuam certas no que
importavam: cor derivada de tema **por conta própria** seria adivinhação. O que
mudou é que agora existe uma declaração explícita do operador. A decisão saiu do
sistema e foi para o arquivo.

## O que a clarificação moveu

Registro do que mudou nos artefatos depois de `/speckit-clarify`, para que a
revisão saiba onde olhar.

| Artefato | Mudança |
|---|---|
| [research.md](research.md) | §2 virou "entre quais fronteiras", com as duas condições vizinhas; §5 é nova, com a medição do NFC |
| [data-model.md](data-model.md) | `CorEfetiva.extraída` passa a `Cor \| null`; a resolução passa a poder devolver `null`; normalização na regra de casamento |
| [contracts/events.md](contracts/events.md) | `extraída: Cor \| null`, com a única combinação que produz `null` |
| [contracts/config.md](contracts/config.md) | Linha da forma Unicode na tabela de comparação; recusa de subida por conflito de codificação |
| [quickstart.md](quickstart.md) | Cenários 5a (NFC), 5b (as duas fronteiras) e 11 (luz não acende sem apresentação) |

**A abordagem não mudou.** Nenhuma resposta contrariou o desenho; duas apertaram
fronteiras que estavam implícitas no código de hoje e uma acrescentou uma regra de
comparação. Se alguma tivesse mudado a abordagem, esta seção diria isso em vez de
listar edições.

### Uma dívida achada de raspão, fora desta feature

`resolverGrupo` em `src/core/grupo.ts` normaliza com `trim().toLowerCase()` e
**não** normaliza a forma Unicode — a mesma exposição que FR-006a corrige aqui.
Não é hipotético: os grupos reais desta instalação incluem `01: Mov Chão`, e o
nome vai para `config.json` digitado à mão enquanto o outro lado vem do socket do
Freestyler. O sintoma seria "grupo configurado não existe", com o log listando um
nome que parece idêntico ao configurado.

Fica **fora do escopo da 003** de propósito: é correção na 002, e emendar as duas
juntas misturaria features. Está registrada como tarefa separada.

## Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| A tag chega do Holyrics em formato diferente do suposto | Média — nunca observada | Cenário 0 do quickstart é pré-requisito; a suposição é marcada no código (Princípio I) |
| Cor declarada perto demais da vigente é suprimida pelo limiar | Baixa, e é **correto** | Consequência declarada de FR-012, não defeito. Registrada em [research.md §2](research.md#2-entre-quais-fronteiras-a-substituição-entra-no-pipeline-da-001) para não ser diagnosticada como bug daqui a um ano |
| Operador declara objeto em vez de array, copiando de outro projeto | Média | `zod` recusa na subida com o caminho do campo; o exemplo comentado mostra a forma certa |
| A dispensa de FR-008a vazar para a ausência de apresentação | **Alta se não houver teste** — as duas condições estão no mesmo `if` | FR-014a existe só para isso; tarefas separadas e o cenário 5b do quickstart cobrem as duas linhas vizinhas |
| Holyrics **remover** acento ao salvar a tag, em vez de gravar noutra forma | Baixa | Fora do alcance de FR-006a. Cenário 0 detecta; a correção seria de spec, não de código |

## Complexity Tracking

Sem violações a justificar. Nenhuma linha nesta tabela.

O único ponto de atrito com a constitution — o Princípio I sobre o formato real
de uma tag — não é complexidade a justificar, e sim verificação a executar quando
o Holyrics estiver disponível. Está tratado no gate acima e no cenário 0 do
quickstart.
