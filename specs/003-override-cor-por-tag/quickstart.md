# Quickstart: Override de cor por tag do tema

**Feature**: 003-override-cor-por-tag

Treze cenários. Os de 1 a 5b rodam **sem nada ligado** — a substituição é decisão
pura. Os de 6 a 11 precisam do Holyrics, e o **cenário 0 precisa acontecer antes
de todos eles**.

```bash
npm test
```

---

## Cenário 0 — Como uma tag chega, de verdade

**Este cenário é pré-requisito dos que usam Holyrics, e é o único que não pode
ser adiado.** Nenhum tema com tag foi observado nesta instalação: a verificação
de 2026-07-28 encontrou `tags: []` em todos. A capacidade da ferramenta está
verificada; o **conteúdo** de uma tag não.

1. No Holyrics, marque um tema com a tag `azul`.
2. Marque outro com uma tag que tenha acento e espaço: `céu da tarde`.
3. Suba o serviço **sem** a seção `coresPorTag` e ponha os dois temas em exibição.
4. Leia as linhas de tema no log.

**Esperado**: as tags aparecem como strings exatamente iguais às digitadas —
`"azul"` e `"céu da tarde"`, uma entrada por tag.

**Se vier diferente, pare e registre antes de continuar.** Três desvios possíveis,
cada um com consequência própria:

| Observado | Consequência |
|---|---|
| Espaço sobrando nas pontas | A regra de FR-006 já apara; confirme que apara o suficiente |
| Acento normalizado (`ceu`) | FR-006 promete que acento conta, e não poderia cumprir. A spec precisa mudar, não o código |
| Uma string com vírgulas, `"azul, escuro"` | O casamento falharia em silêncio. É mudança de contrato, não de detalhe |

O achado — desvio ou confirmação — vai para
[holyrics-api.md](../001-leitura-cor-holyrics/contracts/holyrics-api.md), junto do
resto do contrato verificado.

---

## Cenário 1 — A substituição roda sem nada ligado

```bash
npm test
```

**Esperado**: os testes de `casarTag` e `resolverCorEfetiva` passam com Holyrics
e Freestyler fechados. É o Princípio II sendo cobrado.

## Cenário 2 — Configuração inválida não sobe

Declare duas entradas que casam entre si sob a regra de comparação:

```json
"coresPorTag": [
  { "tag": "Azul",   "cor": { "r": 0, "g": 0, "b": 255 } },
  { "tag": " azul ", "cor": { "r": 255, "g": 0, "b": 0 } }
]
```

**Esperado**: recusa de subida nomeando **as duas** tags (FR-004). Uma delas
venceria sempre e a outra nunca, e nada no log explicaria por quê.

Repita com `tag` vazia, e com um componente de cor em 300. **Esperado**: recusa
apontando o campo, sem ecoar valores de outros campos.

## Cenário 3 — A ordem declarada é a precedência

Declare, nesta ordem, e marque um tema com **as duas** tags:

```json
"coresPorTag": [
  { "tag": "azul-escuro", "cor": { "r": 0, "g": 20, "b": 120 } },
  { "tag": "azul",        "cor": { "r": 0, "g": 40, "b": 200 } }
]
```

**Esperado**: vence `azul-escuro`, e o log registra o empate nomeando `azul` como
preterida (FR-007b).

Agora inverta as duas linhas do arquivo e repita. **Esperado**: vence `azul`. A
ordem das tags dentro do tema não mudou; só o arquivo mudou.

Repita uma vez com a tag `2024` declarada **depois** de `azul`, e um tema com as
duas. **Esperado**: vence `azul`. É o caso que o objeto JSON quebraria em
silêncio — ver [contracts/config.md](contracts/config.md#é-array-e-isso-não-é-estilo).

## Cenário 4 — Sem a seção, nada muda

Remova `coresPorTag` do arquivo e rode a suíte.

**Esperado**: todo o comportamento da 001 e da 002 idêntico ao de antes desta
feature (SC-003) — mesma cor, mesmos tempos, mesmo volume de comandos.

## Cenário 5 — Preto é cor mapeada válida

Mapeie uma tag para `{ "r": 0, "g": 0, "b": 0 }`.

**Esperado**: aceito na subida, e o tema com essa tag apaga as fixtures. É o
operador pedindo escuro, não um valor sentinela (FR-003).

## Cenário 5a — As duas grafias do mesmo acento são a mesma tag

Rodável na suíte, sem nada ligado.

Mapeie `café` gravado em NFC e alimente um tema cuja tag seja `café` gravado em
NFD — visualmente idênticos, bytes diferentes.

**Esperado**: casam (FR-006a). E o par de controle: `ceu` **não** casa com `céu`,
porque acento continua contando (FR-006).

Repita declarando as **duas** grafias como entradas separadas na configuração.
**Esperado**: recusa de subida por conflito, e a mensagem diz que o conflito é de
codificação — senão o operador vê duas linhas iguais na tela sem entender a
acusação (FR-004).

## Cenário 5b — As duas fronteiras de FR-008a

Também rodável na suíte. São dois casos vizinhos que precisam divergir.

| Situação | Esperado |
|---|---|
| Tema mapeado, **leitura de cor falhou** | A cor declarada é anunciada, com o campo da extraída vazio (FR-008a) |
| Tema mapeado, **região inexistente** | Idem — o índice errado não é motivo para segurar a cor |
| Tema mapeado, **consulta de item falhou** | A cor declarada é anunciada: não se sabe que não há apresentação |
| **Sabidamente sem apresentação** | Nada é anunciado, mapeado ou não (FR-014a) |
| Sem extração **e** sem override | Nada é anunciado, como antes desta feature |

A quarta linha é a que merece o teste mais explícito. Ela e a primeira estavam na
mesma condição do código antes desta feature, e afrouxar uma convida a afrouxar a
outra — o que acenderia a luz justamente quando a 002 decidiu não comandar nada.

---

## Cenário 6 — A cor da tag chega ao palco

Com `azul` mapeada e um tema portando a tag em exibição.

**Esperado**: o palco assume a cor declarada, e o valor extraído do Holyrics não
tem efeito observável (SC-001). O log da cor anunciada diz `origem: mapeada`,
nomeia a tag, e traz a cor extraída que foi descartada (FR-015, SC-004).

## Cenário 7 — O override vale quando a extração NÃO muda

É o cenário que motiva a feature inteira.

Troque de um tema escuro **não** mapeado para outro tema escuro mapeado para
vermelho — dois temas cujas cores extraídas são indistinguíveis.

**Esperado**: o palco fica vermelho em até 3 segundos (SC-002). A extração não
mudou; quem mudou foi a cor efetiva.

Para confirmar que a extração de fato não mudou, suba com `LOG_LEVEL=debug` e
compare **a cor da região marcada `escolhida`** nas leituras antes e depois da
troca.

> **Não compare o ΔE nesta verificação.** Com override ativo a referência é a cor
> declarada, então aquele número mede a distância entre a extração e uma cor
> escolhida à mão — não a oscilação da extração. A linha de debug marca esses
> ciclos com `deltaEMedeRuído: false` exatamente para evitar essa leitura errada
> (FR-009). O ΔE só serve para calibrar limiar nos ciclos **sem** override.

## Cenário 8 — Sair do override é tão observável quanto entrar

A partir do estado do cenário 7, troque para um tema **sem** tag mapeada, sem
mexer no telão.

**Esperado**: a cor extraída volta ao palco (FR-011). Sem resíduo do override, e
sem depender de a extração ter mudado.

## Cenário 9 — Tag digitada diferente é diagnosticável

Marque um tema com `azuI` (i maiúsculo no lugar do L) e mantenha `azul` na
configuração.

**Esperado**: a cor não muda, **e** o log registra `azuI` como tag observada e não
mapeada, na primeira troca de tema (FR-017, SC-005). Sem essa linha, o sintoma
seria idêntico ao de override nenhum.

## Cenário 10 — Tema mapeado parado não gera comando

Deixe um tema mapeado em exibição por uma sessão inteira, trocando de música e de
slide dentro dele.

**Esperado**: nenhum comando novo às fixtures após a aplicação inicial (SC-006), e
a cor permanece a declarada apesar das trocas (FR-013). O override é do tema.

## Cenário 11 — A luz não acende sem apresentação

Com um tema mapeado em exibição, encerre a apresentação no Holyrics.

**Esperado**: as fixtures vão para a cor de repouso da 002, e **nenhuma** cor
mapeada é comandada enquanto não houver apresentação (FR-014a). Reabra a
apresentação com o mesmo tema: a cor declarada volta.

É a verificação de que a dispensa do cenário 5b não vazou para onde não devia.

---

## Critérios de sucesso cobertos

| Cenário | Critérios |
|---|---|
| 0 | — (Princípio I) |
| 1 | — (Princípio II) |
| 2 | FR-004 |
| 3 | FR-007, FR-007a, FR-007b |
| 4 | SC-003 |
| 5 | FR-003 |
| 5a | FR-006, FR-006a, FR-004 |
| 5b | FR-008a, FR-014a |
| 6 | SC-001, SC-004 |
| 7 | SC-002 |
| 8 | FR-011 |
| 9 | SC-005 |
| 10 | SC-006 |
| 11 | FR-014, FR-014a |

**SC-007** (configurar exige só uma tag e três números) é verificado lendo o
cenário 6: se ele precisou de mais que isso, o critério falhou.
