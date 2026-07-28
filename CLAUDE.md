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
- Controle no nível de slide/estrofe. O gatilho é a apresentação/item atual.
- Suporte a outros softwares de projeção ou de iluminação.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Stack | Node.js + TypeScript |
| Gatilho | Cor predominante da apresentação atual + troca de música/item |
| Execução | Serviço headless, mapeamento em arquivo de config |
| Topologia | Tudo na mesma máquina Windows, comunicação por `localhost` |

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
  perguntar o estado, não é notificado. Suporta **ETag** (v2.25.0+), que deve ser
  usado para que o polling não fique caro.

Actions relevantes:

- **`GetColorMap`** — o coração do projeto. Com `type: "presentation"` devolve a
  cor predominante do que está na tela pública, em **8 regiões**. Cada região é
  um objeto `{ hex, red, green, blue }` com componentes 0–255. Outros valores de
  `type`: `background`, `image`, `video`, `printscreen`.
- **`GetCurrentPresentation`** — item em exibição, ou `null` se não há
  apresentação. Campos: `id`, `type` (`song`, `verse`, `text`, `image`…), `name`,
  `song_id`, `slide_number`, `total_slides`, `slide_type`.
- **`GetCurrentTheme`** — tema atual (`id`, `name`, `tags`, `bpm`). As `tags` do
  tema são uma via alternativa de mapeamento caso a cor extraída não sirva.

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
  de cor a cada leitura. É preciso um limiar de mudança mínima e/ou suavização
  antes de mandar DMX — não repasse toda variação para as luzes.
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

`.specify/memory/constitution.md` ainda está com os placeholders do template — os
princípios do projeto precisam ser definidos por lá.

## Estado atual

O repositório contém apenas o scaffold do Spec Kit e esta documentação. **Não há
código de aplicação ainda** — nenhum `package.json`, nenhuma dependência
instalada, nenhuma decisão de estrutura de diretórios tomada.

## Pendências a resolver no primeiro spec

- Qual das 8 regiões do `GetColorMap` alimenta quais fixtures (uma região só? uma
  por grupo de fixtures?).
- Formato do arquivo de config: como declarar fixture, endereço DMX inicial e os
  offsets dos canais R/G/B.
- Intervalo de polling e o limiar de mudança de cor que dispara envio.
- O que fazer quando não há apresentação (`GetCurrentPresentation` devolve
  `null`): manter a última cor, apagar, ou ir para uma cor padrão.

## Nota sobre estes dados

Os detalhes das duas APIs acima vieram de leitura da documentação pública, não de
uso verificado contra as ferramentas rodando. Ao implementar, confirme os
formatos de resposta contra o Holyrics e o Freestyler reais antes de assumir que
estão corretos — em especial a forma exata do retorno de `GetColorMap` e o
comportamento do conector do Freestyler sob carga.
