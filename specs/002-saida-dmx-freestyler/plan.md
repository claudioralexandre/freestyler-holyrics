# Implementation Plan: Saída DMX para o Freestyler

**Branch**: `002-saida-dmx-freestyler` | **Data**: 2026-07-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification em `/specs/002-saida-dmx-freestyler/spec.md`

## Summary

Consumir os eventos que a 001 já publica em memória e traduzir `cor_anunciada`
em cor nas fixtures de **um grupo do Freestyler**, declarado por nome na
configuração.

A abordagem técnica está fechada porque o contrato foi verificado contra a
ferramenta real **antes** deste plano existir: fala-se `FSOC` para comandar e
`FSBC` para consultar, sobre `node:net`, sem biblioteca. O grupo é resolvido por
nome a partir do inventário que o próprio Freestyler responde; a cor vai para os
três slots de mistura do grupo selecionado. Detalhes em
[contracts/freestyler.md](contracts/freestyler.md).

## Technical Context

**Language/Version**: TypeScript sobre Node.js 22 LTS, módulos ESM — o mesmo da
001, sem segunda linguagem (Restrição Técnica da constitution).

**Primary Dependencies**: **nenhuma nova.** `node:net` cobre o socket, e o
projeto já tem `zod` (config), `pino` (log) e `vitest` (teste). A biblioteca
`freestyler_node_connector` foi avaliada e **recusada** — ver
[research.md](research.md).

**Storage**: N/A. Estado só em memória; configuração em arquivo JSON, o mesmo da
001 (FR-022).

**Testing**: `vitest`. Toda a lógica pura roda sem Freestyler e sem Holyrics.

**Target Platform**: Windows para o cenário real; a feature roda em qualquer
plataforma que tenha Node.

**Project Type**: serviço headless, processo único. A saída vive no mesmo
processo da 001, porque o contrato de eventos é assinatura em memória.

**Performance Goals**: cor no palco em até 1 s do anúncio (SC-001). Folgado: a
LAN mediu 1,5 ms e uma aplicação de cor custa 4 comandos.

**Constraints**: o protocolo é emulação de teclas e **não confirma valor de
cor**. Só a seleção de grupo é confirmável. O comando de grupo é **toggle**, o
que obriga a ler antes de escrever.

**Scale/Scope**: uma instalação, um universo, um grupo seguidor. A instalação de
referência tem 15 fixtures e 5 grupos.

## Constitution Check

*GATE: avaliado antes da Phase 0 e reavaliado após a Phase 1.*

### I. Contratos Externos São Verificados, Nunca Presumidos

**Status: PASSA, sem condição.** É a primeira vez neste projeto. O contrato do
Freestyler foi verificado contra FreeStyler 4.1.7 com hardware real antes de
existir plano, e está registrado em
[contracts/freestyler.md](contracts/freestyler.md) com o ambiente da observação.

A verificação já rendeu correção de spec — o comando de grupo é toggle, e a
redação anterior de FR-012a teria feito a luz apagar em toda aplicação par.
Encontrar isso no plano custaria uma reescrita; encontrar em produção custaria um
culto.

Permanecem itens não observados, listados no contrato (finalidade exata da porta
3333, persistência da seleção entre conexões, taxa sustentada). Nenhum deles é
consumido pelo código desta feature: onde a informação faltaria, a implementação
lê o estado em vez de supor.

### II. Núcleo Puro, Bordas Finas

**Status: PASSA.** A separação segue a da 001 e as decisões desta feature são
majoritariamente puras:

- resolver nome de grupo contra o inventário (FR-009b, FR-009c) — pura
- decidir se é preciso enviar o toggle (FR-012a) — pura
- decidir se há cor a enviar (FR-015, FR-015a) — pura
- decidir o que vale agora: cor anunciada, repouso, ou nada ainda (FR-027) — pura
- avaliar disponibilidade por heartbeat (FR-021a, FR-021b) — pura, com o tempo
  entrando como parâmetro

O adaptador do Freestyler codifica e decodifica o formato de fio e nada mais. A
regra de "o que enviar" nunca mora nele.

### III. Test-First no Núcleo (NÃO-NEGOCIÁVEL)

**Status: PASSA.** Cada item da lista acima nasce de teste que falha primeiro. O
critério não é a pasta: a codificação `FSOC`/`FSBC` é função pura de string e
entra no mesmo regime, ainda morando em `adapters/`. Só o socket em si fica fora
da obrigação, com verificação manual registrada.

O caso do toggle é exemplar: é lógica pura de três linhas cuja versão errada
apagaria a luz de dois em dois. É exatamente o tipo de coisa que teste pega e
inspeção visual não.

### IV. Degradar Sem Cair

**Status: PASSA.** O Freestyler ausente na subida ou caindo no meio não derruba
o processo (FR-018). A reconexão tem backoff com teto (FR-019), o heartbeat
detecta mesa travada com socket aberto (FR-021a), o grupo inexistente não impede
o serviço de rodar (FR-010a), e exceção ao processar evento é capturada
(FR-007).

**É também o motivo de recusar a biblioteca**: ela instala
`process.on('uncaughtException', … process.exit())`, entregando a um pacote
parado desde 2015 o poder de matar o serviço durante o culto.

### V. Simplicidade Build-to-Learn (YAGNI)

**Status: PASSA.** Um grupo, um universo, sem camada de abstração para outra mesa
de luz, sem dependência nova. O caminho por canal cru está verificado e
documentado, mas **não é implementado** — seria uma segunda via para um caso que
ainda não existe.

A revisão de 29/07 removeu quatro requisitos e uma história inteira ao descobrir
que a ferramenta já resolvia o problema. Isso é o princípio funcionando.

### Reavaliação após a Phase 1

**Todos os gates continuam passando.** O design não introduziu violação, e dois
pontos ficaram mais fortes do que na avaliação inicial:

- **Princípio II**: o núcleo ficou em duas funções puras que devolvem *ações* em
  vez de executá-las — `aplicarEvento` e `planejarEnvio`. Não conhecem socket nem
  timer. Ver [data-model.md](data-model.md).
  > A separação veio da análise: a versão de função única não recebia o status
  > dos grupos e portanto não tinha como decidir se precisava selecionar. Juntar
  > os dois momentos numa assinatura só escondia a dependência.
- **Princípio III**: a trava de FR-027 (`jáHouveCor`) é booleana e pura, então
  "não comandar antes da primeira cor" é testável sem Freestyler. Era o requisito
  com mais risco de virar comportamento acidental.

Um ponto ficou explicitamente registrado como limitação, não como violação: o
modelo **não tem** campo `corAplicada`, só `últimoConjuntoEscrito`. Nomear o
estado pelo que é observável foi decisão de design, e é o que impede o log de
afirmar o que o protocolo não permite saber.

## Project Structure

### Documentation (this feature)

```text
specs/002-saida-dmx-freestyler/
├── spec.md
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── freestyler.md    # VERIFICADO contra 4.1.7 — precede este plano
│   └── config.md        # Campos novos da configuração
├── checklists/
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── state.ts              # (001) tipos de evento consumidos aqui
│   ├── grupo.ts              # NOVO: resolver nome→posição, decidir toggle
│   ├── saida.ts              # NOVO: cor pretendida × escrita, repouso, espera
│   └── heartbeat.ts          # NOVO: disponibilidade por pulso
├── adapters/
│   ├── config.ts             # ESTENDIDO: bloco freestyler
│   ├── logger.ts             # (001)
│   ├── holyrics/             # (001)
│   └── freestyler/
│       ├── protocolo.ts      # NOVO: codificar FSOC, decodificar FSBC
│       └── client.ts         # NOVO: socket TCP, sem regra de negócio
├── service/
│   ├── runtime.ts            # (001) já expõe subscribe()
│   └── saida-dmx.ts          # NOVO: assina eventos, orquestra envio
└── main.ts                   # ESTENDIDO: sobe a saída junto do poller

tests/
├── unit/                     # toda a lógica pura, venha da pasta que vier
│   ├── grupo.test.ts
│   ├── saida.test.ts
│   ├── heartbeat.test.ts
│   └── protocolo.test.ts
└── fixtures/
    └── freestyler-responses.ts   # respostas reais capturadas de 4.1.7
```

**Structure Decision**: mantém a da 001, que a constitution fixa — `core/` não
importa de `adapters/` nem de `service/`. O critério para testar não é a pasta, é
a natureza do código: `protocolo.ts` mora em `adapters/` e é testado como núcleo,
porque é função pura de string. Só `client.ts` (socket real) e a fiação em
`main.ts` ficam sem teste automatizado.

As fixtures de teste são as **respostas reais capturadas** do FreeStyler 4.1.7,
não exemplos inventados — mesma correção que a 001 precisou fazer depois de
descobrir que a documentação mentia sobre o nome dos campos.

## Complexity Tracking

Nenhuma violação de constitution a justificar. A feature não introduz dependência,
não introduz processo, não introduz linguagem, e removeu mais requisitos do que
acrescentou na última revisão.
