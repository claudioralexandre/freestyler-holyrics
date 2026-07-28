# Phase 0 — Research: Leitura de cor do Holyrics

**Feature**: 001-leitura-cor-holyrics | **Data**: 2026-07-28

Este documento resolve os pontos marcados como desconhecidos no Technical Context
do [plan.md](plan.md). Cada decisão traz o motivo e o que foi descartado.

---

## 1. Contrato do Holyrics API Server

**Fonte**: documentação pública em `https://github.com/holyrics/API-Server`,
consultada em 2026-07-28.

> ⚠️ **Status de verificação (Princípio I): NÃO VERIFICADO.** Nada aqui foi
> confirmado contra um Holyrics em execução. Todo o conteúdo desta seção é
> leitura de documentação e MUST ser confirmado antes de o código que o consome
> ser considerado pronto. O contrato observado fica registrado em
> [contracts/holyrics-api.md](contracts/holyrics-api.md), que é o arquivo a ser
> corrigido quando a verificação acontecer.

### Decisão: transporte e autenticação

`POST` para `http://{host}:{porta}/api/{action}?token={token}`, com
`Content-Type: application/json` e o corpo carregando os parâmetros da action.

**Rationale**: é o modo local documentado, e a topologia é `localhost`. O modo
alternativo com hash (`dtoken = sha256(nonce + ':' + rid + ':' + token + ':' +
data)`) protege o token em trânsito — irrelevante quando não há trânsito.

**Alternativas descartadas**: autenticação por hash (complexidade sem ganho em
`localhost`); endpoint de internet `api.holyrics.com.br` (exige `api_key`, sai da
topologia definida e põe dado da igreja na rede).

### Descoberta que corrige a spec: "região" é um índice, não um nome

`GetColorMap` devolve `data` como **array de 8 objetos**, cada um
`{ hex, red, green, blue }`, um por seção da imagem. Não há nome de região no
retorno.

**Consequência**: a configuração indica a região por **índice 0–7**. A FR-002a
("informando quais regiões vieram na resposta") se realiza como validação de
faixa: se o índice configurado não existir no array recebido, a leitura é
descartada e o log informa quantas posições vieram.

**O que continua desconhecido**: qual índice corresponde a qual parte da tela. A
documentação não diz. Isso é exatamente o que a calibração da FR-021 precisa
descobrir, olhando o telão e o log lado a lado.

### Decisão: uma chamada por informação, três por ciclo

Cada ciclo dispara `GetColorMap` (`type: "presentation"`),
`GetCurrentPresentation` e `GetCurrentTheme` de forma independente e paralela,
consolidando os resultados sem deixar que uma falha derrube as outras (FR-004a).

**Rationale**: a API não tem action combinada. Disparar as três em paralelo e
tratar cada resultado isoladamente é a tradução direta do que a FR-004a pede.

**Alternativas descartadas**: encadear sequencialmente (uma falha atrasa ou
impede as seguintes, contrariando FR-004a); consultar item e tema com frequência
menor que a cor (otimização sem problema medido, e complica a lógica de eventos).

### Decisão: envelope de resposta e classificação de erro

Toda resposta traz `{"status": "ok", "data": ...}` ou
`{"status": "error", "error": "..."}`. A classificação usada pelo serviço:

| Situação | Como é detectada | Classificação (FR-017, FR-004c) |
|---|---|---|
| Holyrics fechado | falha de conexão (recusa/timeout) | indisponível |
| Token recusado | HTTP 200 com `status: "error"` mencionando token, ou HTTP 401/403 | credencial recusada |
| Action falhou | `status: "error"` por outro motivo | falha parcial daquela consulta |
| Sem apresentação | `status: "ok"` com `data: null` | estado legítimo, não é erro |

**Ponto de atenção**: a distinção entre "token recusado" e "outro erro" depende
da string devolvida, que a documentação não fixa. Até a verificação, a regra é
conservadora — qualquer `status: "error"` que não seja reconhecido como token
vira falha parcial, nunca queda.

### Decisão: ETag fica de fora

A documentação cita compatibilidade com ETag a partir da v2.25.0.

**Rationale (Princípio V)**: a cor muda a cada leitura por natureza, então ETag
não economizaria nada justamente na consulta mais frequente. O ganho existiria em
item e tema, num serviço que faz 3 requisições por segundo contra `localhost` —
não há custo a otimizar. Entra quando houver problema medido.

---

## 2. Runtime e ferramentas

### Decisão: Node.js 22 LTS + TypeScript, módulos ESM

**Rationale**: a constitution fixa Node + TypeScript. A 22 é a LTS ativa, tem
`fetch` nativo e `AbortSignal.timeout()`, o que elimina uma dependência de HTTP.
Ambiente local confirmado: Node v22.23.1, npm 10.9.8.

**Alternativas descartadas**: CommonJS (ESM é o alvo do ecossistema e não há
dependência legada); Deno/Bun (a constitution diz Node).

### Decisão: cliente HTTP nativo (`fetch` + `AbortSignal.timeout`)

**Rationale**: uma requisição JSON contra `localhost` não justifica dependência.
`AbortSignal.timeout()` entrega o tempo limite exigido pela FR-004 sem código de
controle manual.

**Alternativas descartadas**: `undici` explícito (é o que o `fetch` do Node já
usa por baixo); `axios` (peso sem ganho aqui).

### Decisão: `culori` para a diferença perceptual (ΔE)

Versão atual: 4.0.2.

**Rationale**: a FR-008 pede ΔE perceptual. `culori` converte RGB para Lab e traz
CIEDE2000 pronto, é a biblioteca de cor mais estabelecida do ecossistema e é
funcional/sem estado — encaixa no núcleo puro do Princípio II.

**Alternativas descartadas**: implementar CIEDE2000 à mão (a fórmula tem casos de
borda em torno do matiz que são clássicos de errar, e um erro aqui é silencioso —
exatamente o risco que o Princípio III quer evitar); `chroma-js` (API orientada a
objeto, menos alinhada ao núcleo puro); ΔE76 simples (mais fácil, mas conhecido
por discordar do olho justamente em azuis e verdes saturados, que é o caso de uso).

> A superfície exata da API (`differenceCiede2000()`, `converter('lab')`) MUST ser
> confirmada contra a versão instalada no primeiro uso — vale a mesma disciplina
> do Princípio I, ainda que a biblioteca não seja uma das duas ferramentas
> externas citadas nele.

### Decisão: `pino` + `pino-roll` para o log

Versões atuais: pino 10.3.1, pino-roll 4.0.0.

**Rationale**: a FR-013d–i pede arquivo com rotação por tamanho, saída simultânea
no terminal, níveis de verbosidade e tolerância a falha de escrita. `pino` cobre
níveis e multi-destino; `pino-roll` cobre rotação por tamanho com limite de
arquivos mantidos. Sendo baseado em transports em worker separado, uma falha de
escrita não derruba o loop principal, que é o que a FR-013i exige.

**Alternativas descartadas**: `winston` (mais pesado, configuração de transports
mais cerimoniosa); `console.log` + rotação manual (escrever rotação à mão é
reinventar a parte chata e arriscada); rotação por tempo em vez de tamanho (a
spec pede teto de disco, e teto por tamanho é o que garante isso).

### Decisão: `zod` para validar a configuração

Versão atual: 4.4.3.

**Rationale**: a FR-020 exige recusa de inicialização com mensagem explícita
quando a configuração é inválida. `zod` transforma isso em declaração e produz a
mensagem sozinho, incluindo o caminho do campo problemático.

**Alternativas descartadas**: validação manual com `if` (é o mesmo trabalho
escrito à mão, e mensagens piores); confiar nos tipos do TypeScript (tipo não
existe em tempo de execução — arquivo de config é dado externo).

### Decisão: `vitest` como test runner

Versão atual: 4.1.10.

**Rationale**: o Princípio III torna o ciclo Red-Green-Refactor o caminho crítico
do projeto; `vitest` roda TypeScript sem etapa de build e tem watch rápido, que é
o que sustenta esse ciclo na prática.

**Alternativas descartadas**: `node:test` embutido (zero dependência, mas exige
compilar ou usar loader para TS, atritando o ciclo TDD); `jest` (configuração
para ESM + TS é notoriamente trabalhosa).

---

## 3. Desenho para testabilidade

### Decisão: tempo e I/O entram por parâmetro, nunca por import

O núcleo (decisão de cor, limiar, confirmação, diffing de item/slide/tema) recebe
leituras e devolve eventos. Não conhece relógio, rede nem log.

**Rationale**: é o Princípio II literal, e é o que faz o SC-006 ("lógica
integralmente exercitável sem Holyrics") ser verdade por construção, não por
esforço. O teste da US2 vira uma lista de leituras entrando numa função pura.

**Alternativas descartadas**: injetar um relógio falso via mock global (funciona,
mas espalha conhecimento de tempo pelo núcleo); testar o loop inteiro com
servidor HTTP falso (é teste de adaptador, e a constitution diz que aí a
verificação manual basta).

### Decisão: a máquina de estados de estabilidade é explícita e serializável

O estado do núcleo — cor de referência, contador de confirmação, candidata em
avaliação, último item, último slide, último tema — é um valor simples, e cada
ciclo é `(estado, leitura) → (estado novo, eventos)`.

**Rationale**: torna cada cenário de aceitação da US2 e da US3 um teste de uma
linha, sem preparação. Também é o que permite o FR-013a expor o estado sem
inventar uma segunda fonte de verdade.

**Alternativas descartadas**: guardar o estado em variáveis do módulo (mata a
pureza e obriga reset entre testes); classe com estado interno mutável (mesmo
problema, com mais cerimônia).

---

## 4. O que continua sem resposta até rodar contra o real

Estes itens não são resolvíveis por pesquisa e ficam registrados como pendências
de calibração, conforme a FR-021:

| Pendência | Como será resolvida |
|---|---|
| Qual índice 0–7 representa o tema | Rodar com verbosidade alta, comparar as 8 cores com o telão, escolher e registrar o padrão |
| Valor de ΔE do limiar | Registrar leituras durante uma música inteira, medir a variação em repouso e escolher um limiar acima do ruído observado |
| Tempo limite de uma consulta | Medir a latência típica contra `localhost` e definir um teto folgado |
| String de erro de token recusado | Enviar token inválido de propósito e registrar a resposta exata |
| Forma real do array de cor | Confirmar que são de fato 8 posições e que os componentes são 0–255 |
