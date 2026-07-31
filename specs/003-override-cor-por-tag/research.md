# Research: Override de cor por tag do tema

**Feature**: 003-override-cor-por-tag | **Data**: 2026-07-31

Cinco perguntas precisavam de resposta antes de o desenho fechar. Quatro foram
respondidas por medição contra o que já existe; a quinta ficou **em aberto de
propósito**, marcada como suposição não verificada conforme o Princípio I.

> **Revisado em 2026-07-31 após `/speckit-clarify`.** Três respostas do operador
> entraram depois da primeira versão deste documento: FR-008a (o override vale sem
> leitura de cor), FR-006a (normalização Unicode) e FR-014a (o override **não**
> vale sem apresentação). A §2 mudou de "onde a substituição entra" para "entre
> quais duas fronteiras ela entra", e a §5 é nova.

---

## 1. Que formato preserva a ordem declarada, inclusive para tags só de dígitos?

**Decisão**: o mapeamento é um **array de objetos** `{ tag, cor }`, não um objeto
com a tag na chave.

```json
"coresPorTag": [
  { "tag": "azul-escuro", "cor": { "r": 0, "g": 20, "b": 120 } },
  { "tag": "azul",        "cor": { "r": 0, "g": 40, "b": 200 } }
]
```

**Motivo**: medido, não presumido. FR-007a exige que a ordem declarada sobreviva
à leitura "para qualquer tag que ele possa escrever — inclusive tags compostas só
de dígitos", e um objeto JSON **não** cumpre isso:

```
declarado : azul, 2024, vermelho, 01, 10
Object.keys: 10, 2024, azul, vermelho, 01
```

O resultado é pior do que a spec supunha. Chaves que são índices de array
canônicos (`10`, `2024`) não apenas saltam para a frente das demais — elas se
**reordenam numericamente entre si**, então `10` passa na frente de `2024` mesmo
tendo sido declarada depois. Já `01` fica no lugar, porque `"01"` não é índice
canônico. Ou seja: o mesmo arquivo produz três comportamentos de ordenação
diferentes dependendo de como o operador escreveu a tag.

Isso é exatamente o modo de falha que FR-007a descreve — "a regra de precedência
deixa de valer sem que nada falhe". Com array, a ordem é a ordem, para qualquer
string.

**Alternativas consideradas**:

- **Objeto `{ "azul": {...} }`** — a forma que a descrição original da feature
  sugere e a mais confortável de ler. Recusada pela medição acima. É a única
  recusa desta pesquisa que contraria a intuição do pedido, e por isso está
  registrada com a evidência junto.
- **`Map` construído a partir de array de pares** — resolve a ordem, mas é a
  mesma coisa que o array com uma indireção a mais. A busca é linear de qualquer
  jeito: a precedência **é** varredura em ordem (FR-007), então não há ganho de
  índice a colher.
- **Campo `prioridade` explícito em cada entrada** — daria ordem independente da
  posição no arquivo. Recusado pelo Princípio V: inventa um segundo eixo de
  configuração para um problema que a ordem do array já resolve, e cria o estado
  inválido "duas entradas com a mesma prioridade".

---

## 2. Entre quais fronteiras a substituição entra no pipeline da 001?

**Decisão**: **antes** de `avaliarCor`, dentro de `aplicarCiclo`, **fora** da
condição "a leitura de cor deu certo" e **dentro** da condição "há apresentação no
ar". A cor efetiva — mapeada ou extraída — é a que alimenta limiar e confirmação.

As duas fronteiras não são simetria: uma foi aberta e a outra fechada de
propósito, e elas são **vizinhas no mesmo `if`** do código de hoje.

```ts
// hoje, em aplicarCiclo:
if (leitura.cor.ok && !semApresentação) { ... }
//  └── FR-008a ABRE esta        └── FR-014a mantém esta FECHADA
```

| Fronteira | Requisito | Por quê |
|---|---|---|
| Leitura de cor falhou, ou região inexistente | **FR-008a**: o override vale | A cor declarada não depende da extração. É o FR-004a da 001 — falha de uma consulta não invalida as outras — e a consulta que decide aqui, a do tema, funcionou |
| Sabidamente sem apresentação | **FR-014a**: o override **não** vale | Acenderia a luz exatamente no momento em que a 002 decidiu não comandar nada (FR-027 de lá) |

Quem afrouxar a primeira tende a afrouxar a segunda junto, porque estão na mesma
condição. É por isso que a spec ganhou um requisito só para dizer que não, e por
isso o plano as separa em tarefas distintas.

**Falhar a consulta de item é caso terceiro**, e nele o override vale: a condição
de "sem apresentação" exige `leitura.item.ok`, então item que falhou não é
ausência sabida de apresentação, e a cor segue sendo avaliada como em qualquer
ciclo.

**Consequência de FR-008a no registro**: nos ciclos sem extração válida, a cor
extraída que acompanha o anúncio (FR-009) é **vazia**. Vazio é informação — diz
que a extração falhou naquele ciclo, e não que ela coincidiu com a declarada. O
tipo passa de `Cor` para `Cor | null` nos dois contratos.

**O que FR-008a NÃO muda**: `últimoSucesso.cor`, o horário da última leitura de
cor bem-sucedida, continua avançando **só** quando houve extração válida. Ele é
registro de leitura, não de anúncio; confundir os dois faria o diagnóstico de "há
quanto tempo o Holyrics não responde cor" mentir justamente durante um override.

**Motivo**: é o que faz FR-010 e FR-011 acontecerem **sozinhos**, sem requisito
novo no mecanismo anti-flicker. Rastreando os ciclos com o limiar em 2 e a
confirmação em 2:

| Ciclo | Tema | Extraída | Efetiva | `avaliarCor` |
|---|---|---|---|---|
| N | A, sem tag | C | C | referência = C |
| N+1 | B, tag `vermelho` | C | D | ΔE(C,D) alto → candidata, 1 confirmação |
| N+2 | B | C | D | ΔE(C,D) alto → **anuncia D** |

A extração nunca mudou. Quem mudou foi a cor efetiva, e o mecanismo que já existe
detectou. A saída do override é o mesmo trajeto ao contrário (FR-011).

E o caso de US2 cenário 3 — dois temas mapeados para a **mesma** cor — cai fora
por construção: a efetiva não muda, ΔE é zero, nada é anunciado, nenhum comando
chega às fixtures. Não é código; é consequência.

**Consequência que vale declarar**: se a cor declarada estiver a ΔE ≤ limiar da
que está valendo, o anúncio é suprimido e o palco continua como está. FR-008 diz
que a substituição acontece "sempre", e ela acontece — a cor efetiva **é** a
declarada. O que não acontece é o envio, porque FR-012 manda a cor mapeada passar
pela supressão de envio redundante como qualquer outra. A diferença entre as duas
cores nesse caso é imperceptível por definição do limiar. Não é conflito entre os
dois requisitos; é FR-012 fazendo o que promete.

**Alternativas consideradas**:

- **Substituir depois de `avaliarCor`**, trocando a cor no evento já decidido.
  Recusada: quebra FR-010 no caso que motiva a feature. Se a extração não mudou,
  não há evento a interceptar, e o override nunca dispara. Resolveria o problema
  só onde ele não existe.
- **Anunciar a cor mapeada direto, fora da máquina de estabilidade.** Recusada
  por FR-012 e pela clarificação de 31/07: compraria alguns segundos e pagaria
  com dois caminhos no núcleo, dois conjuntos de teste, e uma exceção
  ("cor declarada pula a fila") para explicar daqui a um ano.
- **Zerar a referência na troca de tema**, para forçar reanúncio como
  `primeira_leitura`. Recusada: teria efeito colateral em toda troca de tema, com
  ou sem mapeamento, e violaria FR-002 (sem mapeamento, comportamento idêntico).

---

## 3. Uma função ou várias? E o que ela devolve?

**Decisão**: **uma** função pura, `casarTag(tema, mapeamentos) → Casamento`,
chamada uma vez por ciclo. O resultado alimenta três necessidades distintas.

**Motivo**: as três coisas que a feature precisa saber são a mesma pergunta feita
uma vez:

| Necessidade | Requisito | O que usa do `Casamento` |
|---|---|---|
| Qual cor segue para a decisão | FR-008 | a cor da tag vencedora |
| De onde a cor veio, no log | FR-015 | a tag vencedora e a extraída descartada |
| Que tags foram vistas e não casaram | FR-017, FR-007b | as não mapeadas e as preteridas |

Uma função com um retorno discriminado cobre as três sem que nenhuma delas
precise repetir a varredura. O detalhamento está em
[data-model.md](data-model.md).

`diferençaDeContexto` passa a devolver o casamento junto do tema, para que a
chamada aconteça **uma vez** e o evento `tema_trocado` e a decisão de cor
enxerguem exatamente o mesmo veredito. Duas chamadas com a mesma entrada dariam o
mesmo resultado — mas uma só torna impossível que divirjam.

**Alternativa considerada**: evento novo, `tag_nao_mapeada`. Recusada pelo
Princípio V. O `tema_trocado` já existe, já é emitido na hora certa, e já carrega
as tags no log — falta apenas o veredito. Um evento a mais custaria contrato,
ordem de entrega e consumidor.

---

## 4. Como uma tag do Holyrics chega, de verdade?

**Decisão**: **não sabemos**, e o código vai dizer isso.

**O que está verificado** (2026-07-28, Holyrics 2.29.1): o campo `tags` de
`GetCurrentTheme` vem **sempre**, como array de strings, e vem **vazio** quando
não há tag. Nunca ausente. Isso está registrado em
[holyrics-api.md](../001-leitura-cor-holyrics/contracts/holyrics-api.md).

**O que não está**: nenhum tema com tag foi observado nesta instalação. A tabela
daquela verificação registra `tags: []` em **todos** os temas, e a conclusão da
época foi que a via de derivar cor das tags "não é viável nesta instalação" —
frase que era sobre as tags **existentes**, não sobre a capacidade da ferramenta.
Esta feature muda a premissa: ela pede que o operador **crie** as tags.

Segue em aberto, portanto:

| Suposição | Por que importa |
|---|---|
| A tag chega como o operador digitou, sem espaço de sobra | FR-006 apara pontas e caixa; se o Holyrics já aparar, a regra é redundante, e se ele guardar de outro jeito, ela é insuficiente |
| O Holyrics aceita acento e espaço dentro de uma tag | FR-006 diz que acento conta. Se a ferramenta **remover** acento ao salvar, a regra promete o que não pode cumprir. Se ela apenas gravar noutra forma Unicode, FR-006a já cobre — ver §5 |
| Uma tag é uma entrada da lista, não uma string com vírgulas | Se o Holyrics devolvesse `["azul, escuro"]` em vez de `["azul","escuro"]`, o casamento falharia em silêncio |

**Como fica resolvido**: o Princípio I proíbe implementar sobre contrato não
verificado sem marcar a suposição **no próprio código**, e é o que o plano faz —
a função de casamento carrega a marca, e o quickstart abre com o passo de criar
uma tag no Holyrics e ler no log a string exata que chegou.

O detalhe agradável é que a feature traz o próprio instrumento de verificação:
FR-017 manda registrar as tags observadas quando nenhuma casa. Antes de existir
mapeamento nenhum, é essa linha que responde "como a tag chegou". A verificação
não precisa de ferramenta separada — precisa de um tema tagueado e um olho no
log.

**Alternativa considerada**: adiar a feature até verificar. Recusada — a
verificação exige o Holyrics do culto, que é o mesmo gargalo da Phase 8 da 002.
Bloquear o desenho por ela pararia o trabalho inteiro por uma pergunta cuja
resposta mais provável (a tag chega como foi digitada) já está tratada pela regra
de comparação de FR-006 e pela normalização de FR-006a.

---

## 5. Duas grafias do mesmo acento são a mesma tag?

**Decisão**: sim. Ambos os lados são normalizados para **NFC** antes de comparar
(FR-006a).

**Motivo**: medido. Duas strings que o operador enxerga como o mesmo texto podem
ser bytes diferentes, e a comparação estrita as separa:

```
visualmente iguais: café café
comprimento     : 4 vs 5
=== estrito     : false
após toLowerCase: false
após normalize  : true
```

A primeira tem o e-agudo num único code point; a segunda tem `e` seguido do acento
combinante. Aparar pontas e baixar a caixa — o que FR-006 já mandava — **não**
resolve: a terceira linha mostra que o problema sobrevive ao `toLowerCase`.

Isto vale mais aqui do que num projeto qualquer por três razões que se somam: a
spec fez questão de que **acento conte** (FR-006), a tag é digitada em **dois
programas diferentes**, e o sintoma é indiagnosticável a olho nu — o log de tag
não mapeada de FR-017 mostraria `café` do lado de `café`, idênticos na tela. O
operador concluiria que o log está mentindo.

**Alternativas consideradas**:

- **Comparar como veio.** Recusada pela medição: transforma um erro invisível de
  codificação em override que não funciona, sem pista nenhuma.
- **Ignorar acento por completo**, fazendo `ceu` casar com `céu`. Recusada porque
  contraria FR-006 explicitamente, e a spec escolheu aquele limite de propósito:
  aproximar nomes distintos é o começo do casamento difuso que a 002 já recusou
  para nome de grupo.
- **Normalizar para NFD** em vez de NFC. Equivalente para o resultado da
  comparação. NFC escolhido por ser a forma que praticamente todo editor de texto
  grava, o que mantém o arquivo de configuração igual ao que o operador vê.

---

## O que não precisou de pesquisa

- **Regra de comparação** — FR-006 já decidia caixa, espaço nas pontas e acento; o
  que faltava era a forma Unicode, resolvido em §5 por FR-006a. A base é a mesma
  de `resolverGrupo` na 002, que serve de referência direta — **menos** a
  normalização, que é adição desta feature.
  > Vale notar como dívida da 002, não desta: `resolverGrupo` compara nome de grupo
  > sem normalizar, e é exposto ao mesmo problema com um grupo acentuado. Não é
  > escopo daqui, e mudá-lo junto misturaria duas features. Fica registrado.
- **Dependência nova** — nenhuma. `zod` valida a seção, o array é do JSON, a
  comparação é `String.prototype`. Nada entra no `package.json`.
- **Mudança na 002** — nenhuma no código. Ela consome `cor_anunciada` e não
  pergunta a origem; continua ignorando `tema_trocado`. A emenda ao FR-003 de lá
  é de **texto**, não de comportamento, e está detalhada no
  [plano](plan.md#emendas-às-specs-anteriores).
