# Implementation Plan: Painel de configuração

**Branch**: `004-painel-de-configuracao` | **Date**: 2026-07-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-painel-de-configuracao/spec.md`

## Summary

Uma página servida pelo próprio processo mostra o que o integrador está vendo
agora e edita o arquivo de configuração que já existe. Nenhuma dependência nova:
`node:http` serve, SSE empurra estado, e o arquivo continua sendo o único
armazenamento.

O trabalho **não** está na página. Está em duas premissas que a feature derruba:

| Premissa que cai | Onde ela está hoje | O que a substitui |
|---|---|---|
| Configuração é constante durante a vida do processo | `main.ts` distribui `config.*` na subida e cada componente guarda o seu | Um diff puro traduz "o que mudou" em **efeitos**, e só os efeitos daquele campo rodam (FR-018, FR-019) |
| O estado observável já basta para a página | `EstadoObservável` em `runtime.ts:23` | Faltam quatro dos sete campos que a FR-005 pede — ver abaixo |

**A Assumption "o estado observável já existe" está errada por quatro campos.**
`snapshot()` hoje devolve item, slide, tema, `corDeReferência`, disponibilidade do
Holyrics e horários. A FR-005 pede também **cor extraída**, **origem da cor
efetiva**, **tag responsável** e **disponibilidade do Freestyler** — e a FR-009
pede o estado de resolução do grupo. Os três primeiros existem, mas só dentro do
evento `cor_anunciada` ([events.ts:22](../../src/core/events.ts)), que é
instantâneo: entre dois anúncios não há de onde lê-los. O quarto vive numa
closure de `ligarSaídaDMX` ([main.ts:64](../../src/main.ts)) e nunca sai de lá.

Isso não invalida a spec — invalida a estimativa de que a página seria só
apresentação. Parte do trabalho é **fazer o estado observável existir**, e essa
parte é núcleo puro sob o Princípio III.

A abordagem em uma frase: **a configuração vira um valor vivo, e mudar esse valor
produz uma lista de efeitos nomeados** — nunca um "recarregar tudo" que passaria
em qualquer teste e falharia no culto.

## Technical Context

**Language/Version**: TypeScript sobre Node.js 22 LTS, ESM, `--experimental-strip-types` (sem mudança)

**Primary Dependencies**: nenhuma nova. `node:http` serve a página, `EventSource`
do navegador consome o SSE, `node:crypto` calcula o hash de conflito. `zod`,
`pino`, `culori` seguem como estão

**Storage**: o mesmo `config.json` das features 001–003. Gravação atômica por
arquivo temporário + `rename` no mesmo diretório

**Testing**: `vitest`. Núcleo novo (diff de configuração, mesclagem, estado
observável estendido) nasce de teste que falha primeiro — Princípio III

**Target Platform**: Windows do culto; desenvolvimento em Linux. O navegador é o
que já estiver na máquina

**Project Type**: serviço único headless que passa a servir uma página. Não vira
aplicação web — não há build de frontend, bundler nem framework

**Performance Goals**: FR-007 exige refletir mudança em até o dobro do
`leitura.intervaloMs` (hoje 1s → teto de 2s). SSE entrega no ciclo, bem dentro
disso

**Constraints**: nenhuma dependência nova; nenhuma segunda linguagem além do
JavaScript que roda no navegador; a página não pode comandar luz; o token não pode
existir em nenhuma resposta; falha da página não pode derrubar o serviço

**Scale/Scope**: um operador, uma ou duas abas, uma LAN. Nada aqui precisa
escalar — e essa é a licença para o desenho mais direto em cada escolha

## Constitution Check

*GATE: revisado antes da Phase 0 e de novo após a Phase 1. Aprovado nas duas.*

| Princípio | Veredito | Como |
|---|---|---|
| **I — Contratos externos verificados** | **PASS com dívida marcada** | Nenhum contrato de terceiro novo: a página é superfície nossa. Duas suposições de **plataforma** entram, e ambas MUST ser marcadas no código: `rename` atômico sobre arquivo existente no Windows (e o `EPERM` que antivírus e indexador produzem), e a troca de destino de log em `pino` com transporte em worker. Nenhuma das duas é verificável fora do PC do culto |
| **II — Núcleo puro, bordas finas** | **PASS** | O diff de configuração, a tradução para efeitos e a mesclagem que preserva campos desconhecidos são funções puras em `src/core/`. O servidor HTTP traduz formato e não decide nada. `core/` continua sem importar `adapters/` — o diff opera sobre registros genéricos, não sobre o tipo `Config`, justamente para não inverter a seta |
| **III — Test-First no núcleo** | **PASS** | Todo o núcleo novo nasce de teste vermelho. Os adaptadores (servidor, gravação) ficam sob verificação manual registrada, como a constitution permite |
| **IV — Degradar sem cair** | **PASS, e reforçado** | FR-004a (página que não sobe não impede o serviço), FR-018a (endereço novo que não abre é recusa, não perda da página), FR-013/FR-027 (submissão recusada não altera nada). A página é a primeira superfície que **aceita entrada de fora**, então este princípio deixa de ser sobre ausência de dependência e passa a ser sobre entrada hostil |
| **V — Simplicidade build-to-learn** | **PASS com uma tensão declarada** | Sem framework, sem bundler, sem WebSocket, sem autenticação, sem histórico. A tensão é o logger recarregável — ver [Complexity Tracking](#complexity-tracking) |

**Restrições técnicas conferidas:** hosts e portas configuráveis (FR-002, e o
padrão da página é `127.0.0.1` por FR-003a); token fora do arquivo e fora da tela
(FR-015, garantido por construção — `carregarConfig` devolve o token **ao lado**
de `config`, nunca dentro, então serializar `Config` não tem como vazá-lo);
nenhuma segunda linguagem (o JavaScript da página roda no navegador, é a mesma
linguagem).

## Project Structure

### Documentation (this feature)

```text
specs/004-painel-de-configuracao/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — as sete decisões e o que foi recusado
├── data-model.md        # Phase 1 — entidades e transições
├── quickstart.md        # Phase 1 — como verificar que funciona
├── contracts/
│   └── painel-http.md   # Phase 1 — as cinco rotas e os códigos de resposta
├── checklists/
│   └── requirements.md  # Já existe
└── tasks.md             # Phase 2 — /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── core/                      # Puro. Nada aqui faz I/O nem conhece HTTP
│   ├── recarga.ts             # NOVO — diff de configuração → campos → efeitos
│   ├── mesclagem.ts           # NOVO — submissão sobre JSON bruto, preservando desconhecidos
│   ├── state.ts               # ALTERADO — estado passa a carregar cor extraída, origem e tag
│   ├── override.ts            # intocado
│   ├── stability.ts           # intocado (a garantia estrutural da 003 continua valendo)
│   └── saida.ts               # ALTERADO — EstadoDaSaída ganha os grupos conhecidos (FR-009)
├── adapters/
│   ├── painel/
│   │   ├── servidor.ts        # NOVO — node:http, rotas, SSE, encerramento
│   │   └── pagina.ts          # NOVO — HTML+CSS+JS da página, como string
│   ├── config.ts              # ALTERADO — bloco `painel`; validação exportada para reúso
│   ├── config-escrita.ts      # NOVO — gravação atômica e hash do arquivo
│   └── logger.ts              # ALTERADO — logger recarregável
├── service/
│   ├── painel.ts              # NOVO — liga runtime + config viva + servidor; aplica efeitos
│   ├── runtime.ts             # ALTERADO — EstadoObservável ganha os campos que faltam
│   ├── poller.ts              # ALTERADO — o ritmo passa a ser trocável sem cortar ciclo em curso
│   └── saida-dmx.ts           # ALTERADO — parâmetros substituíveis sem cortar envio em curso
└── main.ts                    # ALTERADO — monta a config viva e assina os efeitos

tests/unit/
├── recarga.test.ts            # NOVO
├── mesclagem.test.ts          # NOVO
├── config.test.ts             # ALTERADO — bloco `painel`, padrões, FR-003a
├── state.test.ts              # ALTERADO — campos novos do estado
└── runtime.test.ts            # NOVO — snapshot estendido
```

**Structure Decision**: a estrutura de três camadas da 001 continua valendo sem
exceção. A página é um adaptador (`src/adapters/painel/`), a composição é serviço
(`src/service/painel.ts`), e a decisão — o que mudou e o que isso obriga a fazer —
é núcleo (`src/core/recarga.ts`). O teste dessa separação é concreto: **deve ser
possível verificar toda a lógica de recarga sem abrir um socket**, do mesmo jeito
que hoje se verifica a lógica de cor sem Holyrics ligado.

## As sete decisões

Detalhadas com alternativas em [research.md](research.md). Resumo:

1. **`node:http` cru**, sem framework. Cinco rotas não pagam uma dependência.
2. **SSE**, não polling nem WebSocket. `runtime.subscribe` já é o ponto de
   extensão desenhado para isso, e `EventSource` reconecta sozinho — que é
   exatamente o que a FR-018a precisa quando o endereço muda debaixo da aba.
3. **A página é uma string TypeScript**, não um arquivo estático. `tsc` não copia
   `.html` para `dist/`, e resolver isso custaria etapa de build para uma tela.
4. **Diff genérico por caminho, tabela explícita de efeitos.** `core/recarga.ts`
   compara dois registros e devolve caminhos como `leitura.regiao`; uma tabela
   nomeada mapeia caminho → efeito. É o que torna FR-018 e FR-019 verificáveis
   campo a campo, e o que mantém `core/` sem conhecer o tipo `Config`.
5. **Conflito por hash SHA-256 do conteúdo**, não por mtime. Granularidade de
   mtime é de segundo em alguns sistemas de arquivo, e duas gravações no mesmo
   segundo passariam despercebidas.
6. **Gravação por temporário + `rename` no mesmo diretório**, com o `EPERM` do
   Windows tratado por nova tentativa curta. É a FR-024, e o modo de falha é a
   SC-006.
7. **Escrita por mesclagem sobre o JSON bruto**, não serialização do `Config`
   validado. O `zod` descarta chaves desconhecidas em `safeParse`
   ([config.ts:149](../../src/adapters/config.ts)); gravar o objeto validado
   apagaria em silêncio exatamente o que a FR-025 manda preservar.

## Ordem de implementação

Quatro blocos, e a ordem não é arbitrária — cada um é verificável sozinho.

1. **O estado observável fica completo.** Núcleo primeiro: `state.ts` passa a
   carregar cor extraída, origem e tag; `runtime.ts` compõe Freestyler e grupo.
   Ao fim deste bloco a FR-005 é satisfazível, e nada foi servido ainda.
2. **A configuração vira valor vivo.** `core/recarga.ts` e `core/mesclagem.ts`
   nascem de teste. `main.ts` deixa de distribuir valores na subida e passa a
   assinar efeitos. Ao fim deste bloco a recarga a quente funciona — sem página,
   exercitada por teste.
3. **A página existe, e o caminho de escrita fecha junto.** Servidor, rotas, SSE,
   HTML — e também validar, mesclar, gravar e despachar efeitos. A tentação é
   deixar a escrita para a história que a exercita, mas **salvar é pré-requisito
   da US1**, não refinamento dela: sem o caminho completo, a primeira história
   entregável não entrega nada. Só apresentação e submissão vivem aqui; toda
   decisão já foi tomada nos blocos 1 e 2.
4. **As reversões de escopo.** `CLAUDE.md` e as specs 002 e 003 corrigidas, com o
   texto que caiu nomeado. É trabalho desta feature, não da próxima.

O bloco 2 é o caro e o arriscado. Se algo desta feature quebrar um culto, é ele.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples recusada porque |
|---|---|---|
| **Logger recarregável por indireção** — um objeto estável cujo `pino` interno é substituível | A SC-002 não abre exceção: **nenhum** campo pode exigir reinício, e `log.arquivo` é campo. Trocar o destino exige um transporte novo, mas todos os componentes já capturaram a referência do logger na subida | Excetuar o destino de log da recarga a quente contrariaria a SC-002 e a FR-010. Mutar só `log.level` (que o `pino` aceita nativamente) resolveria metade e deixaria a outra metade mentindo — a página confirmaria a troca de arquivo e os registros continuariam no antigo |
| **`SaídaDMX.atualizarParâmetros()`** em vez de parâmetros imutáveis capturados na criação | FR-020 proíbe interromper envio em curso, e `criarSaídaDMX` hoje fecha sobre `parâmetros` como constante | Recriar a saída inteira a cada recarga refaria a conexão e a resolução de grupo por qualquer mudança — exatamente o efeito colateral que a FR-019 proíbe |

Nenhuma das duas introduz camada, arquivo de abstração ou ponto de extensão para
caso futuro. As duas são consequência direta de requisitos que a spec discutiu e
manteve.
