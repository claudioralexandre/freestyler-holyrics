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
| Gatilho | Cor do tema em exibição + troca de item + avanço de slide |
| Execução | Serviço headless, mapeamento em arquivo de config |
| Topologia | Alvo: tudo na mesma máquina Windows por `localhost`. **Verificado entre duas máquinas na LAN** — ver ressalva do token abaixo |
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
  `{ hexa, reg, green, blue }` com componentes 0–255. **Atenção aos nomes**: a
  documentação diz `hex`/`red`, mas a ferramenta manda `hexa`/**`reg`** — `reg` é
  o vermelho. Exigir `red` fazia toda leitura falhar, em silêncio. **Não há
  região nomeada** — a configuração aponta por **índice 0–7**; a região 0 é a
  mais representativa (verificado). Sem apresentação, `data` vem `null`, não
  array. Outros `type`: `printscreen` (captura real, difere de `presentation`),
  e `background`/`image`/`video`, que vêm `null` com tema gerado.
- **`GetCurrentPresentation`** — item em exibição, ou `null` se não há
  apresentação. Campos: `id`, `type` (`song`, `verse`, `text`, `image`…), `name`,
  `song_id`, `slide_number`, `total_slides`, `slide_type`.
- **`GetCurrentTheme`** — tema atual (`id`, `name`, `tags`, `bpm`), ou `null`.
  > **Mudou na feature 003 (2026-07-31).** O tema deixou de ser observação pura:
  > as `tags` passam a decidir a cor **quando, e somente quando, uma delas estiver
  > declarada** na seção `coresPorTag`. Sem mapeamento, o comportamento antigo
  > vale palavra por palavra. A diferença é que a decisão saiu do sistema e foi
  > para o arquivo — derivar cor de tema por conta própria continuaria sendo
  > adivinhação.
  >
  > **Suposição em aberto:** o campo `tags` está verificado (vem sempre, array de
  > strings, vazio quando não há tag), mas nenhum tema **com** tag foi observado
  > nesta instalação. Como uma tag chega — espaço, acento, uma entrada por tag ou
  > string com vírgulas — segue não verificado, e está marcado em
  > `src/core/override.ts`.

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
- **Evitar flicker.** A spec 001 pôs **duas** barreiras: limiar de ΔE perceptual
  **e** confirmação por permanência. A justificativa original era que o polling
  sobre fundo em vídeo produziria variação a cada leitura.
  > **Premissa desmentida (2026-07-28).** A verificação contra o Holyrics 2.29.1
  > mediu **ruído zero**: 80 leituras com vídeo rodando, 80 trocas de slide, e o
  > color map não mudou um bit. Ele é função **do tema**, não do quadro nem do
  > slide. As duas barreiras continuam no código como seguro barato — e porque
  > protegem se uma versão futura passar a amostrar por quadro — mas hoje são
  > seguro, não necessidade. O `limiarDeltaE` deixou de filtrar ruído e passou a
  > ser perceptual: por isso caiu de 10 para 2.
- **O Freestyler é um alvo frágil.** Como o protocolo emula teclas, comandos
  rápidos demais ou em excesso podem se perder. Respeite o limite de ~100 valores
  e não bombardeie o socket.
  > **Divergência conhecida, decidida em 2026-07-31.** O limite de ~100 valores é
  > do caminho por **canal cru** (`setDMXFromArray`), não do conector inteiro. A
  > 002 colore um grupo com três comandos de slot, então FR-014 dispensa
  > fatiamento. A correção é na **constitution**, por emenda PATCH em mudança
  > dedicada (`/speckit-constitution`) — nunca junto de código de feature. Até
  > lá, é divergência de redação, não de comportamento.
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

**001 — leitura de cor**: implementada, verificada contra Holyrics 2.29.1, com
os tres valores calibrados. Falta so o quickstart completo (T073).

**002 — saida DMX**: implementada por inteiro, com a documentacao (Phase 9) e a
emenda de 31/07 (Phase 11) fechadas. 206 testes; nucleo e adaptador do Freestyler
com **100% de cobertura**. **Falta so a Phase 8**: a verificacao com apresentacao
no ar por um culto (T051-T056), que exige as duas ferramentas rodando com
hardware e nao tem como ser feita fora do PC do culto.

O desenho da 002 mudou bastante depois que o protocolo do Freestyler foi
verificado: a configuracao declara **nome de grupo**, nao endereco DMX, porque a
ferramenta responde o patch quando perguntada. Isso eliminou a ferramenta de
calibracao que a spec original previa.

A sessao de clarificacao de 2026-07-31 acrescentou tres coisas: o bloco
`freestyler` ausente virou a **unica** forma de desligar a saida (FR-008a), o
prazo de consulta virou configuravel com teto na metade da janela de heartbeat
(FR-023a), e toda selecao efetivada passou a registrar **quantas e quais**
fixtures atingiu (FR-025b) — porque grupo vazio e integrador quebrado produzem o
mesmo sintoma.

**003 — override de cor por tag**: implementada ate a Phase 7 de 9. 261 testes.
Falta a verificacao contra o Holyrics real (Phase 8). A configuracao ganhou a
secao `coresPorTag`, um **array ordenado** de `{ tag, cor }` — array e nao objeto
porque a ordem declarada e a regra de precedencia, e chave JSON so de digitos
salta de posicao em silencio.

O desenho inteiro cabe numa frase: a cor efetiva, mapeada ou extraida, entra na
maquina de estabilidade no lugar da extraida. Com isso o override passa a valer
mesmo quando a extracao nao muda — que e o caso que motivou a feature — sem que
`src/core/stability.ts` precise saber que override existe. Aquele arquivo ficou
**intocado**, e isso e a garantia estrutural de que a cor mapeada nao pula
nenhuma barreira.

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

**Resolvidas na spec 002**, as três que estavam abertas para a saída:

- Formato da config de fixtures: **não existe**. A configuração declara o nome do
  grupo, e o Freestyler responde o patch quando perguntado (FR-009).
- Sem apresentação, as luzes vão para uma `corDeRepouso` obrigatória e explícita
  — mas só depois da primeira cor de verdade: antes disso o integrador não
  comanda nada, para não roubar a seleção de quem está configurando a mesa.
- O evento de slide **não** produz efeito nas luzes, por decisão registrada.

**Resolvidas na verificação de 2026-07-28** (Holyrics 2.29.1): índice de região
(**0**, a mais próxima do centroide das oito), limiar de ΔE (**2**, agora
perceptual e não anti-ruído) e tempo limite (**800ms**, contra 1,5ms medido). Os
três deixaram de ser chute.

**Abertas, ainda dependem do real:** item sem noção de slide (imagem avulsa), se
`type: "presentation"` reflete tela pública ou preview, e o tamanho relativo de
cada uma das 8 regiões.

## Nota sobre estes dados

**O Holyrics foi verificado em 2026-07-28** contra a versão 2.29.1, e o registro
completo está em `specs/001-leitura-cor-holyrics/contracts/holyrics-api.md`. A
verificação achou quatro divergências que a documentação não deixava suspeitar:

1. **`reg` em vez de `red`** — impedia 100% das leituras de cor, sem erro visível.
2. **`data: null` no color map** sem apresentação — era tratado como resposta malformada.
3. **É média amostrada, não cor predominante** — e a cor não muda com o vídeo nem com o slide.
4. **Dois erros distintos sob o mesmo HTTP 401** — pediam ações opostas do operador.

A primeira sozinha justifica a existência do Princípio I: o sintoma seria "a luz
nunca muda de cor", indistinguível de configuração errada.

**Ressalva de segurança.** A verificação rodou entre duas máquinas na LAN, não em
`localhost`. O token viaja em claro na query string, e a justificativa para
descartar o modo hash SHA256 era justamente não haver rede no caminho. Se a
topologia de duas máquinas virar definitiva, essa decisão precisa ser reaberta.

**O Freestyler continua não verificado.** Nada foi levantado além do que está
nesta página; o comportamento do conector sob carga segue sendo suposição, e a
spec 002 já nasce com essa dívida marcada.
