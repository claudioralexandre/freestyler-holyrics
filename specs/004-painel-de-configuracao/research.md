# Research: Painel de configuração

**Feature**: 004 | **Date**: 2026-07-31 | **Plan**: [plan.md](plan.md)

Sete decisões. Cinco vieram de leitura do código que já existe, duas de
propriedade conhecida de plataforma. Nenhuma exigiu experimento — o que exigir
verificação contra a máquina real está marcado na
[§8](#8-o-que-esta-feature-não-pode-verificar-daqui).

---

## 1. Como servir a página sem dependência nova

**Decisão:** `node:http` cru, com um roteador de cinco entradas escrito à mão.

**Rationale:** o projeto já recusou dependência quando o nativo servia — `fetch`
nativo em vez de cliente HTTP, registrado em `CLAUDE.md`. São cinco rotas, todas
sem parâmetro de caminho, sem middleware, sem negociação de conteúdo. Um
`switch` sobre `req.method` e `req.url` cabe em trinta linhas e não tem
comportamento escondido.

**Alternativas consideradas:**

- **Express / Fastify** — traria roteamento, parsing de corpo e tratamento de
  erro prontos. Recusada pelo Princípio V: nada disso é problema aqui, e cada
  dependência nova é superfície que precisa ser entendida antes do próximo culto.
- **Servir por arquivo estático de um diretório** — recusada junto com a §3.

## 2. Como a página acompanha o estado sem recarregar (FR-007)

**Decisão:** SSE (`text/event-stream`) numa rota dedicada, alimentado pelo mesmo
ciclo que já publica eventos.

**Rationale:** três razões, em ordem de peso.

1. **O ponto de extensão já existe e foi desenhado para isto.**
   `runtime.subscribe` ([runtime.ts:35](../../src/service/runtime.ts)) é o
   contrato pelo qual a saída DMX e o painel de terminal já se penduram no ciclo.
   O SSE é esse mesmo contrato atravessando HTTP.
2. **`EventSource` reconecta sozinho.** A FR-018a manda o serviço se re-servir num
   endereço novo, derrubando a aba aberta de propósito. Com polling, a página
   ficaria mostrando estado congelado até alguém apertar F5; com `EventSource`, a
   reconexão é comportamento do navegador, não código nosso.
3. **Unidirecional é o caso.** O serviço fala, a página escuta. A submissão de
   configuração é requisição comum, não precisa do mesmo canal.

**Alternativas consideradas:**

- **Polling do navegador a cada `intervaloMs`** — mais simples no servidor (zero
  conexões abertas para rastrear e encerrar). Recusada por duas: mediria a FR-007
  na margem em vez de com folga, e deixaria a FR-018a sem resposta para a aba
  aberta.
- **WebSocket** — exigiria a dependência `ws`, porque `node:http` não fala o
  protocolo. Bidirecional sem ter o que mandar de volta. Recusada.

**Consequência assumida:** o servidor passa a manter um conjunto de respostas
abertas, que precisam ser encerradas no `SIGTERM` e na troca de endereço da
FR-018a. É a única complexidade que o SSE cobra, e está no escopo de uma função.

## 3. Onde vive o HTML

**Decisão:** a página é uma string exportada de um módulo TypeScript
(`src/adapters/painel/pagina.ts`), com CSS e JavaScript embutidos nela.

**Rationale:** o projeto roda de duas formas — `node --experimental-strip-types
src/main.ts` no desenvolvimento e `dist/main.js` depois do `tsc`. O `tsc` **não
copia** arquivos que não sejam TypeScript, então um `painel.html` ao lado do fonte
funcionaria no `dev` e sumiria no `start:built`. Corrigir isso pede etapa de cópia
no build, para uma tela só.

Como string, o arquivo é encontrável, versionável e não tem caminho para resolver
em tempo de execução — que é a classe de bug que só aparece na máquina do outro.

**Alternativas consideradas:**

- **Arquivo `.html` lido por `readFileSync` em relação a `import.meta.url`** —
  natural e errado aqui, pelo motivo acima.
- **Etapa de cópia no `build`** — resolve, e acrescenta um passo de build que a
  feature seguinte precisaria lembrar de manter. Recusada pelo Princípio V.

**Custo aceito:** perde-se destaque de sintaxe do HTML dentro da string. É
incômodo de edição, não de operação.

## 4. Como a recarga sabe o que fazer (FR-018, FR-019, FR-021a)

**Decisão:** duas funções puras em `src/core/recarga.ts`.

```
camposAlterados(antes, depois) → caminhos como "leitura.regiao"
efeitosDe(caminhos)            → conjunto de efeitos nomeados
```

**Rationale:** a FR-018 não pede "recarregar a configuração" — pede que cada campo
produza **o efeito dele e nenhum outro**, e a FR-019 pede que campo inalterado não
produza efeito nenhum. Escrito como um `if` gigante no serviço, isso é
inverificável sem subir tudo. Escrito como diff puro mais tabela, cada linha da
FR-018 vira um teste de uma linha.

A tabela é explícita e exaustiva de propósito. Caminho desconhecido **não** cai
num padrão silencioso: cai num efeito `desconhecido` que é registrado em log — do
contrário, um campo acrescentado numa feature futura seria aceito pela página,
gravado no arquivo e simplesmente não valeria, sem nada indicando por quê.

**Por que o diff é genérico e não tipado em `Config`:** `core/` não importa de
`adapters/`, e é essa regra que permite rodar a lógica sem o resto do mundo. O
diff opera sobre `Record<string, unknown>` aninhado e devolve caminhos em texto; a
tabela de efeitos é a única parte que conhece os nomes, e ela também é núcleo.

**Tabela de efeitos** (a forma canônica está em
[data-model.md](data-model.md#efeitos-de-recarga)):

| Caminho | Efeito |
|---|---|
| `leitura.intervaloMs` | `ritmo_de_leitura` |
| `leitura.regiao` | `parametros_do_nucleo` **+** `zerar_estado_de_cor` (FR-021a) |
| `cor.*`, `coresPorTag` | `parametros_do_nucleo` |
| `holyrics.*` | `reconectar_holyrics` |
| `freestyler.host`, `freestyler.port` | `reconectar_freestyler` |
| `freestyler.grupo` | `reresolver_grupo` |
| `freestyler.corDeRepouso`, prazos | `parametros_da_saida` |
| bloco `freestyler` inteiro entrando ou saindo | `religar_saida` |
| `log.*` | `reconfigurar_log` |
| `painel.*` | `re_servir_painel` |
| `reconexao.*` | `parametros_de_reconexao` |

**Alternativas consideradas:**

- **Recriar o serviço inteiro a cada recarga aceita** — uma linha de código e
  quatro requisitos violados de uma vez: reconectaria Holyrics e Freestyler por
  qualquer mudança (FR-018, FR-019), zeraria a máquina de cor sempre (FR-021) e
  poderia cortar um envio em curso (FR-020).
- **Cada componente observa a configuração viva e se vira** — espalharia a
  decisão por cinco arquivos e tornaria a FR-019 impossível de verificar num lugar
  só.

## 5. Como detectar que o arquivo mudou por fora (FR-026)

**Decisão:** hash SHA-256 do conteúdo bruto lido, via `node:crypto`. A página
recebe o hash junto da configuração e o devolve na submissão; o servidor compara
com o hash do arquivo **no momento da gravação**.

**Rationale:** mtime tem granularidade de um segundo em alguns sistemas de
arquivo, e o caso da FR-026 é justamente o de duas escritas próximas. O arquivo
tem poucos kilobytes — o hash é irrelevante em custo e exato em resultado.

Comparar no momento da gravação, e não no recebimento, fecha a janela entre
validar e escrever.

**Alternativas consideradas:**

- **mtime, ou mtime + tamanho** — falha silenciosamente no caso que a FR-026
  existe para cobrir. Recusada.
- **Manter o arquivo aberto com trava** — não é portável e transformaria "editei à
  mão" em "não consigo salvar no bloco de notas", que é hostil ao caso da US4.

## 6. Gravação atômica (FR-024, SC-006)

**Decisão:** escrever num temporário no **mesmo diretório** do destino, `fsync`,
`rename` sobre o original. Em `EPERM`/`EBUSY` no Windows, uma retentativa curta
antes de reportar falha.

**Rationale:** `rename` dentro do mesmo volume é a operação atômica que os
sistemas de arquivo oferecem — daí "mesmo diretório", e não um temporário em
`%TEMP%`, que pode estar em outro volume e degradar para cópia não atômica. O
`fsync` antes do `rename` é o que impede o caso de queda de energia deixar um
arquivo novo de tamanho certo e conteúdo vazio.

**Suposição de plataforma, a marcar no código (Princípio I):** no Windows,
`rename` sobre arquivo existente pode falhar com `EPERM` quando antivírus ou
indexador estão com o arquivo aberto naquele instante. É transitório, e a
retentativa curta cobre. **Não verificável fora do PC do culto.**

**Alternativas consideradas:**

- **`writeFileSync` direto no destino** — é exatamente o que a FR-024 proíbe: uma
  interrupção deixa o arquivo pela metade, o serviço não sobe, e um ajuste de cor
  vira um culto sem integrador.
- **Escrever cópia de segurança antes** — resolveria a integridade e criaria um
  segundo arquivo de configuração, contra a FR-023.

## 7. O que exatamente é gravado (FR-025)

**Decisão:** mesclar a submissão sobre o **JSON bruto lido do disco**, preservando
toda chave que a submissão não mencione. Função pura em `src/core/mesclagem.ts`.

**Rationale:** este é o ponto onde a intuição erra. O esquema `zod` do projeto usa
objetos comuns, e `safeParse` **descarta chaves desconhecidas**
([config.ts:149](../../src/adapters/config.ts)). Gravar `JSON.stringify(config)`
depois de validar apagaria comentários estruturados, campos de features futuras e
qualquer coisa que alguém tenha posto ali à mão — em silêncio, que é o modo de
falha que este projeto persegue desde o `reg`/`red` da 001.

Mesclar sobre o bruto também é o que faz a FR-010 ("todos os campos editáveis") e
a FR-025 ("preserve o que não exibe") pararem de se contradizer: a página exibe
tudo que o **esquema** conhece, e preserva tudo que ele não conhece.

**Detalhe que não é detalhe:** `coresPorTag` é array, e array **substitui**, não
mescla. Fundir posição a posição faria a remoção de um mapeamento não remover
nada — e a ordem, que na 003 é a regra de precedência, viraria resultado de uma
fusão que ninguém escreveu.

**Alternativas consideradas:**

- **Serializar o `Config` validado** — recusada pelo acima.
- **`.strict()` no esquema, recusando chave desconhecida** — tornaria a FR-025
  vazia por decreto e quebraria arquivos existentes. Fora de escopo desta feature.

## 8. O que esta feature não pode verificar daqui

Duas suposições de plataforma entram no código e MUST ser marcadas nele
(Princípio I), porque a verificação depende da máquina do culto:

1. **`rename` atômico sobre arquivo existente no Windows**, e a frequência real do
   `EPERM` por antivírus. Aqui roda Linux.
2. **Troca de destino de log em `pino` com transporte em worker.** O logger atual
   cria o transporte uma vez ([logger.ts:301](../../src/adapters/logger.ts)); o
   plano o torna substituível por indireção, e o comportamento do worker antigo ao
   ser descartado sob escrita concorrente não foi observado.

Nenhuma das duas é contrato de terceiro no sentido da 001 — não há Holyrics nem
Freestyler envolvido. São propriedades de plataforma, e entram na mesma disciplina
por serem igualmente invisíveis quando erradas.

**O que continua não verificado das features anteriores:** o comportamento do
Freestyler sob carga, e a suposição de forma das tags do Holyrics marcada em
`src/core/override.ts`. Esta feature não os toca e não os resolve.
