# Implementation Plan: Leitura de cor do Holyrics

**Branch**: `001-leitura-cor-holyrics` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-leitura-cor-holyrics/spec.md`

## Summary

Serviço headless que consulta o Holyrics a cada segundo, extrai a cor de uma
região da apresentação em exibição, e só anuncia mudança de cor quando ela
ultrapassa um limiar perceptual (ΔE) e se sustenta por duas leituras seguidas.
Além da cor, acompanha item, slide e tema, emitindo um evento para cada mudança.
Nada é enviado ao Freestyler — a saída é um ponto de assinatura em memória, mais
log em arquivo com rotação.

A abordagem técnica é um núcleo puro `(estado, leitura) → (estado, eventos)`,
cercado por três adaptadores finos: cliente HTTP do Holyrics, configuração e log.
Todo o comportamento descrito nas US1–US3 vive no núcleo e é testável sem
Holyrics; a US4 (resiliência) vive no loop de serviço, ao redor do núcleo.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node.js 22 LTS (ambiente confirmado:
v22.23.1), módulos ESM

**Primary Dependencies**:

- `culori` 4.x — conversão de cor e ΔE CIEDE2000 (FR-008)
- `pino` 10.x + `pino-roll` 4.x — log com níveis, arquivo rotacionado e terminal (FR-013d–i)
- `zod` 4.x — validação da configuração na inicialização (FR-020)
- HTTP: `fetch` nativo do Node com `AbortSignal.timeout()` — sem dependência

**Storage**: N/A. Nenhuma persistência de dados. O único arquivo escrito é o log.
A configuração é lida, nunca escrita.

**Testing**: `vitest` 4.x. Testes unitários obrigatórios no núcleo (Princípio
III); adaptadores verificados manualmente contra o Holyrics real (Princípio I).

**Target Platform**: Windows (mesma máquina que Holyrics e Freestyler,
comunicação por `localhost`). Desenvolvimento em Linux — nada no desenho depende
de plataforma.

**Project Type**: Serviço headless de processo único, com núcleo em biblioteca
interna. Sem UI, sem servidor HTTP próprio, sem banco.

**Performance Goals**: 1 ciclo por segundo, 3 requisições por ciclo contra
`localhost`. Anúncio de troca real de cor em até 3s (SC-002); retomada após queda
do Holyrics em até 30s (SC-005). Nenhuma dessas metas pressiona o runtime — o
gargalo é a latência do Holyrics, não o processamento.

**Constraints**: processo não pode terminar por indisponibilidade de dependência
(FR-014); teto de disco para o log (SC-009); credencial nunca em log (SC-007);
ciclos não se sobrepõem (FR-004).

**Scale/Scope**: um consumidor, uma instância, uma máquina. Sessão típica de 2
horas, ~7.200 ciclos. Ordem de 1.000 linhas de código.

## Constitution Check

*GATE: avaliado antes da Phase 0 e reavaliado após a Phase 1.*

### I. Contratos Externos São Verificados, Nunca Presumidos

**Status: PASSA COM CONDIÇÃO.** O contrato do Holyrics foi levantado da
documentação pública e está registrado em
[contracts/holyrics-api.md](contracts/holyrics-api.md), marcado de forma
ostensiva como **NÃO VERIFICADO**. O princípio permite isso desde que a suposição
esteja explicitamente marcada — está, no arquivo e em cada campo.

A condição: a verificação contra o Holyrics real é tarefa obrigatória antes de a
feature ser dada como pronta, e o arquivo de contrato é o artefato a ser
corrigido. A pesquisa já produziu uma correção sobre a spec — as regiões de cor
são um **array de 8 posições indexado 0–7**, não regiões nomeadas.

### II. Núcleo Puro, Bordas Finas

**Status: PASSA.** A estrutura separa `src/core/` (sem `import` de rede, relógio,
`fs` ou log) de `src/adapters/`. O núcleo é uma função
`(estado, leitura) → (estado, eventos)`; os adaptadores traduzem formato e nada
mais. A decisão de disponibilidade (FR-004c), o backoff (FR-015) e a
classificação de erro ficam em `src/service/`, que orquestra sem conter regra de
cor.

### III. Test-First no Núcleo (NÃO-NEGOCIÁVEL)

**Status: PASSA.** Todo comportamento das US1–US3 é núcleo e nasce de teste que
falha primeiro: seleção de região, ΔE, limiar, confirmação por permanência,
adoção de referência, diffing de item/slide/tema, transições de "sem
apresentação". O backoff da US4 também é lógica pura (dado um número de falhas,
qual o próximo intervalo) e entra no mesmo regime. Adaptadores ficam fora da
obrigação, com verificação manual registrada.

### IV. Degradar Sem Cair

**Status: PASSA.** O loop de serviço trata cada consulta de forma independente
(FR-004a), considera o Holyrics perdido apenas quando todas falham (FR-004c),
reconecta com backoff limitado a 15s (FR-015), isola falha do consumidor
(FR-013c) e tolera falha de escrita de log (FR-013i). Nenhum caminho de erro
chega a terminar o processo, exceto configuração inválida na inicialização
(FR-020), que é falha de partida, não de operação.

### V. Simplicidade Build-to-Learn (YAGNI)

**Status: PASSA.** Recusados explicitamente: ETag, combinação de regiões, canal
de rede para o consumidor, formato de mensagem versionado, camada de abstração
para outros softwares de projeção, uso das tags de tema como fonte de cor. Cada
recusa está registrada com o critério de reabertura em
[research.md](research.md).

### Restrições Técnicas

| Restrição | Situação |
|---|---|
| Stack Node + TypeScript, sem segunda linguagem | Atendida |
| Hosts e portas configuráveis, nunca fixos | Atendida (FR-018, [contracts/config.md](contracts/config.md)) |
| Limite de ~100 valores do Freestyler | Não se aplica — esta feature não fala com o Freestyler |
| Anti-flicker antes de enviar DMX | Atendida no núcleo, antes de existir DMX |
| Somente fixtures seguidoras alteradas | Não se aplica |
| Token fora do git, nunca em log | Atendida (variável de ambiente, redação no log) |

**Nenhuma violação a justificar.** A seção Complexity Tracking fica vazia.

## Project Structure

### Documentation (this feature)

```text
specs/001-leitura-cor-holyrics/
├── plan.md              # Este arquivo
├── spec.md              # Especificação da feature
├── research.md          # Phase 0 — decisões e alternativas descartadas
├── data-model.md        # Phase 1 — entidades, estado e transições
├── quickstart.md        # Phase 1 — como rodar e validar
├── contracts/
│   ├── holyrics-api.md  # Contrato consumido (NÃO VERIFICADO)
│   ├── events.md        # Contrato exposto: eventos e estado em memória
│   └── config.md        # Contrato de configuração e variáveis de ambiente
├── checklists/
│   └── requirements.md  # Checklist de qualidade da spec
└── tasks.md             # Phase 2 — gerado por /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── core/                      # Puro: sem I/O, sem relógio, sem log
│   ├── color.ts               # Seleção de região, conversão, ΔE (FR-002, FR-008)
│   ├── stability.ts           # Limiar + confirmação por permanência (FR-006–009a)
│   ├── presentation.ts        # Diffing de item, slide e tema (FR-010–012a)
│   ├── backoff.ts             # Progressão de intervalo entre tentativas (FR-015)
│   ├── state.ts               # Estado do serviço e sua transição por ciclo
│   └── events.ts              # Tipos de evento emitidos
│
├── adapters/                  # Finos: traduzem formato, sem regra de negócio
│   ├── holyrics/
│   │   ├── client.ts          # POST das três actions, timeout, classificação de erro
│   │   └── schema.ts          # Validação da resposta contra o contrato
│   ├── config.ts              # Leitura e validação de config + env (FR-018–020)
│   └── logger.ts              # pino + pino-roll, redação de credencial
│
├── service/                   # Orquestração: loop, ciclo, disponibilidade
│   ├── poller.ts              # Ciclo sem sobreposição, consultas independentes
│   ├── availability.ts        # Estado de disponibilidade e log sem repetição
│   └── runtime.ts             # Composição, assinatura do consumidor, encerramento
│
└── main.ts                    # Ponto de entrada

tests/
├── unit/                      # Toda lógica pura, venha de onde vier
│   ├── color.test.ts          # core/color.ts        — obrigatório (Princípio III)
│   ├── stability.test.ts      # core/stability.ts    — obrigatório
│   ├── presentation.test.ts   # core/presentation.ts — obrigatório
│   ├── backoff.test.ts        # core/backoff.ts      — obrigatório
│   ├── state.test.ts          # core/state.ts        — obrigatório
│   ├── availability.test.ts   # service/availability.ts — decisão pura sobre falhas
│   └── config.test.ts         # adapters/config.ts   — validações cruzadas
└── fixtures/
    └── holyrics-responses.ts  # Respostas de exemplo do contrato

config/
└── config.example.json        # Modelo versionado; o real fica fora do git
```

**Structure Decision**: projeto único, sem workspaces. As três pastas dentro de
`src/` são a tradução direta do Princípio II — `core/` não importa nada de
`adapters/` nem de `service/`, e essa é a regra que sustenta o SC-006.

**O critério para testar não é a pasta, é a natureza do código.** Toda **lógica
pura** é testada, esteja onde estiver: além do núcleo inteiro (obrigatório pelo
Princípio III), entram as validações cruzadas de configuração e a decisão de
disponibilidade — ambas são funções determinísticas sobre dados, e ambas moram
fora de `core/` por razões de organização, não de natureza.

O que fica **deliberadamente sem teste automatizado** é o I/O propriamente dito:
o `fetch` do cliente, a escrita do `pino`, a leitura do arquivo de config. Testar
isso contra um servidor falso verificaria a suposição em vez do contrato real,
que é o oposto do que o Princípio I pede — ali vale verificação manual
registrada.

Para isso funcionar, `service/availability.ts` e `adapters/config.ts` MUST
separar a decisão pura (testável) da execução (não testada): a função que decide
se o Holyrics está perdido recebe os resultados do ciclo e devolve um veredito,
sem tocar em rede.

`service/` existe como camada separada porque a lógica de disponibilidade e
backoff não é pura (depende de relógio e de resultado de rede), mas também não é
tradução de formato — não caberia bem nem no núcleo nem num adaptador.

## Constitution Re-Check (após Phase 1)

Reavaliado contra os artefatos gerados. **Nenhum gate mudou de status.**

| Princípio | Situação após o desenho | Evidência |
|---|---|---|
| I | Passa com condição — inalterada | [contracts/holyrics-api.md](contracts/holyrics-api.md) traz status por seção, tabelas "A verificar" e procedimento de verificação |
| II | Passa | [data-model.md](data-model.md) define a transição pura; `momento` entra como campo da leitura, não como chamada de relógio |
| III | Passa | Cenário 1 do [quickstart.md](quickstart.md) é a verificação executável do SC-006 |
| IV | Passa | Cenário 3 do quickstart exercita queda e recuperação; `contracts/config.md` faz a validação garantir o teto de 30s do SC-005 |
| V | Passa | Nenhuma abstração nova apareceu no desenho; `contracts/events.md` declara explicitamente que não é contrato público |

### Correção que o desenho produziu na spec

A pesquisa do contrato revelou que `GetColorMap` devolve um **array de 8
posições**, sem regiões nomeadas. A FR-002a dizia "informando quais regiões
vieram na resposta" — informação que a API não fornece. O texto foi corrigido
para "quantas regiões vieram na resposta".

É exatamente o efeito que o Princípio I existe para produzir: a suposição
apareceu antes do código, não durante o culto.

## Complexity Tracking

Nenhuma violação da constitution a justificar. Todas as decisões que adicionariam
generalidade foram recusadas e registradas em [research.md](research.md) com o
critério que as reabriria.
