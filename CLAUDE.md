# freestyler-holyrics

Integrador que faz a **iluminação DMX acompanhar o que está sendo projetado**: o
projeto lê a cor predominante da apresentação atual no **Holyrics** e aplica essa
cor nas fixtures RGB controladas pelo **Freestyler**.

Exemplo do comportamento alvo: se o tema da música em exibição é azul, as
fixtures configuradas como "seguidoras de cor" ficam azuis.

Projeto pessoal, no estilo **build to learn** — priorize clareza e soluções
diretas sobre generalidade. Não construa abstração para caso que ainda não
existe.

## Objetivos

1. Ler o estado de apresentação do Holyrics e extrair a cor predominante.
2. Traduzir essa cor para canais DMX e enviar ao Freestyler.
3. Rodar como serviço headless, com o mapeamento de fixtures em arquivo de config.
4. Aprender o fluxo de trabalho do Spec Kit conduzindo o desenvolvimento por ele.

### Fora de escopo (por enquanto)

- Interface web ou qualquer UI. O mapeamento vive em arquivo de configuração.
- Cenas de luz complexas, chases, efeitos temporizados. O escopo é cor sólida.
- Suporte a outros softwares de projeção ou de iluminação.

> **Mudança de escopo (2026-07-28).** "Controle no nível de slide/estrofe" estava
> nesta lista e saiu. O avanço de estrofe passou a emitir evento próprio, para que
> uma mesma música possa produzir mais de um gatilho. O integrador **emite** o
> evento de slide; o que as luzes fazem com ele continua sendo decisão da feature
> de saída.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Stack | Node.js 22 LTS + TypeScript, módulos ESM |
| Gatilho | Cor predominante da apresentação + troca de item + avanço de slide |
| Execução | Serviço headless, mapeamento em arquivo de config |
| Topologia | Tudo na mesma máquina Windows, comunicação por `localhost` |
| Diferença de cor | Perceptual (ΔE CIEDE2000), não distância em RGB |
| Anti-flicker | Limiar de ΔE **mais** confirmação por permanência (N leituras seguidas) |
| Bibliotecas | `culori` (cor), `pino` + `pino-roll` (log), `zod` (config), `vitest` (testes) |
| HTTP | `fetch` nativo do Node com `AbortSignal.timeout()` — sem dependência |
| Config | Arquivo JSON + `HOLYRICS_TOKEN`, `CONFIG_PATH`, `LOG_LEVEL`. Sem flags de CLI |

O Freestyler é Windows-only, o que fixa a topologia. Holyrics, Freestyler e o
integrador rodam no mesmo PC — não há rede entre eles.

## As duas integrações

### Holyrics — API Server

Documentação: https://github.com/holyrics/API-Server

- **Transporte:** HTTP `POST`, `Content-Type: application/json`
- **URL:** `http://localhost:{porta}/api/{action}?token={token}`
- **Auth:** token na query string (há também um modo hash SHA256 com nonce, mais
  seguro, desnecessário em `localhost`)
- **Sem webhook, sem websocket.** A API é somente poll — o integrador precisa
  perguntar o estado, não é notificado. Suporta **ETag** (v2.25.0+), que foi
  **avaliado e descartado**: a cor muda a cada leitura por natureza, então não
  haveria economia justamente na consulta mais frequente, e não há custo a
  otimizar em `localhost`.
- **Envelope:** `{"status": "ok", "data": ...}` ou
  `{"status": "error", "error": "..."}`. Ausência de apresentação vem como
  `data: null` — é estado legítimo, não erro.

Actions relevantes:

- **`GetColorMap`** — o coração do projeto. Com `type: "presentation"` devolve
  `data` como **array de 8 posições**, uma por seção da tela pública, cada uma
  `{ hex, red, green, blue }` com componentes 0–255. **Não há região nomeada** —
  a configuração aponta a região por **índice 0–7**. Qual índice corresponde a
  qual parte da tela a documentação não diz; isso é objeto de calibração. Outros
  valores de `type`: `background`, `image`, `video`, `printscreen`.
- **`GetCurrentPresentation`** — item em exibição, ou `null` se não há
  apresentação. Campos: `id`, `type` (`song`, `verse`, `text`, `image`…), `name`,
  `song_id`, `slide_number`, `total_slides`, `slide_type`.
- **`GetCurrentTheme`** — tema atual (`id`, `name`, `tags`, `bpm`), ou `null`. O
  tema é lido e registrado **como observação apenas** — nunca influencia a cor
  anunciada. As `tags` estão no log para que a calibração revele se a cor extraída
  basta; usá-las como fonte alternativa de cor seria decisão de outra feature.

### Freestyler — Node Connector

Documentação: https://github.com/jschyma/FreestylerNodeConnector
Pacote npm: `freestyler_node_connector`

- **Transporte:** socket **TCP** na porta **3332**
- **Sem autenticação**
- **Formato de fio:** sequências ASCII no padrão `FSOC{n}255` que **emulam teclas**
  do Freestyler (ex.: `FSOC333255` é o comando DMX, `FSOC337255` é ENTER). Não é
  protocolo DMX de verdade — é automação de teclado por socket.

API do conector:

- `connect()` — abre a conexão, devolve promise
- `setDMX(canal, valor)` — um canal
- `setDMXFromArray(objeto)` — vários canais de uma vez
- `toggleBlackout()`
- `close()`

**Limitação conhecida:** o Freestyler não aceita mais de ~100 valores por lote.
Qualquer envio em massa precisa ser fatiado.

## Restrições de projeto

- **Nem toda fixture segue a cor.** A config declara quais fixtures são
  seguidoras; as demais ficam intocadas pelo integrador.
- **Evitar flicker.** Polling contínuo sobre uma imagem de fundo produz variação
  de cor a cada leitura. Resolvido na spec 001 com **duas** barreiras, não uma:
  limiar de ΔE perceptual **e** confirmação por permanência — a cor nova precisa
  se sustentar por N leituras seguidas antes de ser anunciada. Uma leitura só
  acima do limiar (flash de vídeo, transição de slide) zera a contagem e não vira
  evento. Não repasse toda variação para as luzes.
- **O Freestyler é um alvo frágil.** Como o protocolo emula teclas, comandos
  rápidos demais ou em excesso podem se perder. Respeite o limite de ~100 valores
  e não bombardeie o socket.
- **Reconexão.** Tanto o Holyrics quanto o Freestyler podem estar fechados quando
  o serviço sobe, ou cair durante o culto. O serviço precisa tolerar os dois
  ausentes e se recuperar sozinho, sem derrubar o processo.
- **Segredos fora do git.** O token do Holyrics vai em variável de ambiente ou
  arquivo local ignorado, nunca commitado.

## Fluxo de trabalho

O projeto usa **Spec Kit** (`.specify/`), com as skills `/speckit-*` instaladas em
`.claude/skills/`. O ciclo pretendido:

```
/speckit-constitution  →  /speckit-specify  →  /speckit-plan  →  /speckit-tasks  →  /speckit-implement
```

Antes de implementar qualquer feature, verifique se existe spec correspondente em
`specs/`. Se não existir, comece por `/speckit-specify`.

`.specify/memory/constitution.md` está **ratificada na v1.0.0**, com cinco
princípios. Dois deles mudam como se escreve código aqui e não são negociáveis:

- **Princípio III** — todo comportamento do núcleo nasce de teste que falha
  primeiro. Vale para lógica pura onde quer que ela more, não só em `src/core/`.
- **Princípio I** — nada de implementar sobre contrato que só existe na
  documentação sem marcar a suposição **no próprio código**.

## Estado atual

A feature **001-leitura-cor-holyrics** está especificada, planejada e com tarefas
geradas — spec, plan, research, data-model, contratos e quickstart em
`specs/001-leitura-cor-holyrics/`. **Ainda não há código de aplicação**: nenhum
`package.json`, nenhuma dependência instalada. A T001 é literalmente criar o
projeto.

Escopo da 001: só o lado de entrada. Lê o Holyrics, produz sinal de cor estável e
eventos de item/slide/tema, expostos por assinatura em memória. **Nada de DMX nem
Freestyler** — isso é feature seguinte, que se inscreve nos eventos descritos em
`specs/001-leitura-cor-holyrics/contracts/events.md`.

## Estrutura do código (quando existir)

```
src/core/      # Puro: sem I/O, sem relógio, sem log. É onde vive a decisão
src/adapters/  # Finos: traduzem formato. Holyrics, config, log
src/service/   # Loop, disponibilidade, backoff. Nem puro, nem tradução
tests/unit/    # Toda lógica pura, venha da pasta que vier
```

`core/` não importa nada de `adapters/` nem de `service/`. É essa regra que
permite rodar toda a lógica de cor sem Holyrics ligado.

## Pendências

**Resolvidas na spec 001:** região de cor (uma só, por índice, em config),
intervalo de leitura (1s), limiar (ΔE configurável + confirmação por
permanência), comportamento sem apresentação (reporta o estado, descarta a
referência de cor).

**Abertas, para a feature de saída:**

- Formato da config de fixtures: endereço DMX inicial e offsets dos canais R/G/B.
- O que as luzes fazem quando não há apresentação: manter a última cor, apagar ou
  ir para uma cor padrão.
- Se o evento de slide deve gerar reação nas luzes, e qual.

**Abertas, dependem de rodar contra o real:** o índice de região que representa o
tema, o valor de ΔE do limiar e o tempo limite de consulta. Os três estão no
`config.example.json` como chute declarado.

## Nota sobre estes dados

Os detalhes das duas APIs acima vieram de leitura da documentação pública, não de
uso verificado contra as ferramentas rodando.

Para o Holyrics, o contrato levantado está registrado em
`specs/001-leitura-cor-holyrics/contracts/holyrics-api.md`, marcado como **NÃO
VERIFICADO**, com tabelas do que falta observar e o procedimento de verificação.
**É esse o arquivo a corrigir** quando houver acesso ao Holyrics real — e o
código que o consome deve carregar a mesma marcação até lá.

Para o Freestyler, nada foi levantado ainda além do que está nesta página. O
comportamento do conector sob carga continua sendo suposição.
