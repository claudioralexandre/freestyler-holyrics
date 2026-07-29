# Contrato consumido: Holyrics API Server

**Feature**: 001-leitura-cor-holyrics | **Levantado em**: 2026-07-28

> # ✅ VERIFICADO EM PARTE — 2026-07-28
>
> **Ambiente da verificação**: Holyrics **2.29.1**, Windows 10 pt-BR, API Server
> na porta 8091, acessado pela LAN a partir de outra máquina (`192.168.1.26`).
> Latência típica observada: **1,5 ms** (máximo 13 ms no handshake inicial).
>
> A verificação encontrou **três divergências**, uma delas grave o bastante para
> impedir a feature de funcionar. Estão descritas nas seções correspondentes e já
> corrigidas no código.
>
> **Continua não verificado**: o comportamento contra fundo em **vídeo**, que é o
> único cenário onde o anti-flicker tem o que filtrar. Todos os testes até agora
> usaram fundo estático, e mediram ruído temporal **ΔE 0,00**. O
> `cor.limiarDeltaE` segue sendo chute declarado.
>
> Cada seção abaixo traz seu próprio status.

---

## Transporte

**Status: ✅ VERIFICADO** (2.29.1, 2026-07-28)

```
POST http://{host}:{porta}/api/{action}?token={token}
Content-Type: application/json

{ ...parâmetros da action... }
```

- Host e porta vêm da configuração, nunca fixos (Restrições Técnicas).
- O token vai na query string. A justificativa original era que a comunicação é
  `localhost` e não atravessa rede — **premissa quebrada na verificação**, que
  rodou entre duas máquinas. Ver "Consequências da topologia" abaixo.
- O modo alternativo com hash (`dtoken = sha256(nonce + ':' + rid + ':' + token +
  ':' + data)`) existe e foi descartado — ver [research.md](../research.md).

**Observado**: corpo vazio (`{}`) é aceito nas actions sem parâmetros. Todas as
respostas trazem `Server: Holyrics API Server`, CORS liberado (`*`) e
`Connection: close` — **não há keep-alive**, cada leitura abre uma conexão TCP
nova. A 1 leitura/s isso é irrelevante, mas está registrado.

### Consequências da topologia

A verificação rodou com Holyrics e integrador em máquinas **diferentes**, o que
contraria a topologia declarada no `CLAUDE.md` e na constitution. Duas decisões
se apoiavam no `localhost`:

| Decisão | Estado |
|---|---|
| Token em claro na query string | A justificativa não vale mais fora de `localhost`. Se a topologia de duas máquinas for definitiva, o modo hash deve ser reavaliado |
| `requestTimeoutMs: 800` | **Confirmado com folga**: 1,5 ms típico na LAN. Não precisa mudar |

Também observado: o Windows Firewall bloqueia por padrão a porta do API Server
para acesso externo, com DROP silencioso (a conexão pendura até o timeout, não
recebe RST). Sintoma indistinguível de "Holyrics fechado" pelo lado do cliente.

---

## Envelope de resposta

**Status: ✅ VERIFICADO** (2.29.1, 2026-07-28)

Sucesso:

```json
{ "status": "ok", "data": {} }
```

Erro:

```json
{ "status": "error", "error": "invalid token" }
```

### Observado: dois erros distintos sob o mesmo 401

Este era o ponto mais frágil do contrato, e a verificação mostrou que ele é pior
do que se supunha — não há uma string de erro, há **duas**, com o mesmo código
HTTP e significados opostos para o operador:

| Situação | HTTP | Corpo |
|---|---|---|
| Token errado | **401** | `{"status": "error", "error": "invalid token"}` |
| Token certo, action sem permissão | **401** | `{"status": "error", "error": "unauthorized action"}` |
| Action inexistente | **401** | `{"status": "error", "error": "unauthorized action"}` |

Os dois continuam classificados como `credencial_recusada`, porque nenhum se
resolve com nova tentativa. Mas o `detalhe` os separa: em `unauthorized action` o
token está correto e o ajuste é nas **permissões da action**, dentro do Holyrics.
Sem essa distinção o log mandaria o operador trocar uma credencial que está boa.

Detalhe de formato: o envelope de erro vem com espaço depois dos dois-pontos
(`{"status": "error"`), o de sucesso não (`{"status":"ok"`). Irrelevante para o
parser, registrado para quem for comparar strings cruas.

---

## Action: `GetColorMap`

**Status: ✅ VERIFICADO** (2.29.1, 2026-07-28) — e era mesmo o ponto de maior
incerteza: **as três divergências do contrato estão aqui.**

Requisição:

```json
{ "type": "presentation" }
```

Resposta **real** (8 posições, com apresentação em exibição):

```json
{
  "status": "ok",
  "data": [
    { "hexa": "FF0024", "reg": 255, "green": 0, "blue": 36 }
  ]
}
```

### Divergência 1 — os nomes dos campos estão errados na documentação

| Documentação | Real (2.29.1) |
|---|---|
| `hex` | **`hexa`** |
| `red` | **`reg`** |
| `green` | `green` |
| `blue` | `blue` |

`reg` é o vermelho — confirmado pelo hexadecimal: `FF0024` bate com
`reg:255, green:0, blue:36`. É aparentemente um erro de digitação que a
ferramenta enviou para produção.

**Gravidade**: o validador exigia `red`, então **toda leitura de cor falhava**,
em 100% dos ciclos. O sintoma seria "a luz nunca muda de cor" — não um erro
visível. O código agora aceita `reg` **e** `red`: se uma versão futura corrigir o
nome, a leitura continua funcionando em vez de quebrar do mesmo jeito silencioso.

### Divergência 2 — sem apresentação, `data` é `null`

Não é array vazio nem array de pretos: é `null`, igual às outras duas actions. A
documentação não menciona o caso.

**Gravidade**: o validador classificava `null` como `resposta_invalida`. Como
"sem apresentação" é o estado normal antes do culto e entre blocos, o log
acumularia erro falso a cada segundo. Agora é tratado como ausência legítima.

### Divergência 3 — é média amostrada, não cor predominante

A spec e o `CLAUDE.md` falavam em "cor predominante". **É média**, e nem sequer
média exata. Medido com imagens de teste sintéticas:

| Imagem projetada | Média verdadeira | Devolvido |
|---|---|---|
| Xadrez 8px vermelho/azul, 50/50 | `(127, 0, 127)` | `(74, 0, 180)` na maioria das regiões, `(180, 0, 74)` nas regiões 3 e 6 |
| Faixas 10px, 70% vermelho / 30% verde | `(178, 76, 0)` | `(216, 38, 0)` — mede 85% onde há 70% |

Cor predominante devolveria primária pura; nunca devolveu. Logo, é média. Mas o
desvio contra padrões finos indica **subamostragem**: o Holyrics lê uma grade de
pontos, não todos os pixels, e contra alta frequência espacial a grade aliasa. O
aliasing é **posicional** — as regiões 3 e 6 escorregaram para o lado oposto das
demais no xadrez.

Em ambos os testes a soma dos componentes deu **254**, não 255.

**Consequência prática**: nenhuma para fundo real, que é foto, vídeo ou
gradiente, sem frequência espacial alta o bastante para aliasar. Mas o valor lido
é uma **estimativa amostrada**, não um número exato — e é provavelmente daí que
virá o ruído que o anti-flicker existe para filtrar.

### O color map é função do TEMA, e só dele

A descoberta de maior consequência da verificação, e a que contraria a premissa
central do desenho da feature.

| Estímulo | O color map mudou? |
|---|---|
| 80 leituras ao longo de 40 s, vídeo de partículas rodando de fundo | **Não.** Zero bits |
| 40 leituras a 200 ms (8 s) durante o mesmo vídeo | **Não.** Zero bits |
| ~80 trocas de slide, ida e volta entre 1 e 5 da mesma música | **Não.** Zero bits |
| Troca de tema | **Sim** |

O Holyrics calcula essa cor uma vez, quando o tema entra, e a serve pronta. Ela
representa o tema — não o instante, não o slide, não o quadro do vídeo.

**O que isso derruba.** O `CLAUDE.md` justificava o anti-flicker assim:
*"Polling contínuo sobre uma imagem de fundo produz variação de cor a cada
leitura."* **Não produz.** A variação medida é exatamente zero, inclusive com
vídeo em movimento na tela.

O limiar de ΔE e a confirmação por permanência não estão errados e não devem ser
removidos: continuam sendo a proteção certa caso uma versão futura passe a
amostrar por quadro, e custam quase nada. Mas são **seguro, não necessidade** —
e o projeto precisa saber disso em vez de seguir acreditando na premissa.

**O que isso muda na calibração.** O `limiarDeltaE` não pode ser definido como
"acima do ruído", porque não há ruído. O papel dele passa a ser perceptual: a
partir de que diferença vale mexer na luz. Daí o valor **2** — o limite do
perceptível — no lugar do 10 original, que descartaria trocas de tema visíveis.

**O intervalo de 1 s continua justificado**, mas por outro motivo: item e slide
mudam depressa e foram detectados corretamente. Só a *cor* é que fica parada.

### Mapa das regiões

Determinado projetando divisões conhecidas e cruzando as leituras:

| Índice | Metade (topo/base) | Metade (esq./dir.) | Quadrante |
|---|---|---|---|
| 0 | cima | esquerda | superior esquerdo |
| 1 | cima | esquerda | superior esquerdo |
| 2 | cima | esquerda | superior esquerdo |
| 3 | cima | **direita** | superior direito |
| 4 | baixo | esquerda | inferior esquerdo |
| 5 | baixo | esquerda | inferior esquerdo |
| 6 | baixo | **direita** | inferior direito |
| 7 | cima | esquerda | superior esquerdo |

**Não é um grid.** Quatro regiões caem no quadrante superior esquerdo e apenas
uma em cada quadrante da direita. Nenhuma leitura voltou misturada nas duas
divisões, o que significa que **nenhuma região cruza o meio da tela** em nenhum
dos dois eixos — descarta anel 3×3 sem centro e descarta 2 linhas × 4 colunas.

O que ainda não se sabe: o **tamanho** relativo de cada região, e portanto qual
delas melhor representa o fundo como um todo. Contra um tema real, a dispersão
entre regiões foi de ΔE 0,63 a 8,73 (tema liso) e até 20,6 (imagem assimétrica).

### O que isto corrige na spec

`data` é um **array de 8 posições**, uma por seção da imagem. **Não há região
nomeada.** A spec fala em "região indicada na configuração" — na prática isso é
um **índice inteiro de 0 a 7**.

Consequência para a FR-002a: quando o índice configurado não existe no array
recebido, a leitura é descartada e o log informa quantas posições vieram — não
"quais regiões existem", que não é informação que a API forneça.

### Situação de cada item que estava aberto

| Item | Resultado |
|---|---|
| São de fato 8 posições, sempre | ✅ Sim, em todas as leituras |
| Qual índice corresponde a qual parte da tela | ✅ Quadrante mapeado (tabela acima). Tamanho relativo continua desconhecido |
| Componentes são 0–255 inteiros | ✅ Sim |
| O que vem quando não há apresentação | ✅ `data: null` |
| Se `type: "presentation"` reflete a tela pública ou o preview | ⚠️ **Continua aberto.** Os testes projetaram na tela pública e a leitura acompanhou, mas nada isolou uma da outra |
| **Ruído contra fundo em vídeo** | ⚠️ **Continua aberto.** Só houve fundo estático; ruído medido ΔE 0,00 em 30 amostras. É o que falta para o `limiarDeltaE` |

Outros valores de `type` (`background`, `image`, `video`, `printscreen`) existem e
não são usados por esta feature.

---

## Action: `GetCurrentPresentation`

**Status: ✅ VERIFICADO** (2.29.1, 2026-07-28) — sem divergência.

Requisição: sem parâmetros.

Resposta **real**:

```json
{
  "status": "ok",
  "data": {
    "id": "zj6VBHTtwBxhb",
    "type": "song",
    "name": " Holyrics (Software & App)",
    "song_id": "1611686353330",
    "reference_id": "1611686353330",
    "arrangement_name": null,
    "translation_preset_id": null,
    "slide_number": 2,
    "total_slides": 3,
    "slide_type": "default"
  }
}
```

Campos a mais que a documentação não listava: `reference_id`,
`arrangement_name`, `translation_preset_id`. Não há campo `slides`. Nenhum deles
é usado — o validador ignora extras, então isso não quebrou nada.

Quando não há apresentação: `data: null` — estado legítimo, não é erro (FR-003).

Campos usados: `id`, `type`, `name`, `slide_number`, `total_slides`. Os campos
`slide_type` e `slides` são ignorados.

### Situação de cada item que estava aberto

| Item | Resultado |
|---|---|
| `id` é estável enquanto o item está em exibição | ✅ Sim. `id` permaneceu `zj6VBHTtwBxhb` através de trocas de tema, com `slide_number` fixo em 2 |
| `slide_number` começa em 0 ou 1 | ⚠️ Parcial: observado `slide_number: 2` de `total_slides: 3`. Nunca se viu o primeiro slide, então a base continua indeterminada |
| Itens sem slides (imagem, vídeo) | ⚠️ **Continua aberto.** Só houve item `type: "song"` |
| `name` vem vazio com frequência | ✅ Não. Veio preenchido, com um espaço à esquerda (`" Holyrics (Software & App)"`) — o `&` chega escapado como `&` no JSON |

---

## Action: `GetCurrentTheme`

**Status: NÃO VERIFICADO**

Requisição: sem parâmetros.

Resposta **real**:

```json
{
  "status": "ok",
  "data": {
    "id": "1785284575939",
    "type": "theme",
    "name": "Tema 9",
    "width": null,
    "height": null,
    "duration": null,
    "tags": [],
    "bpm": 0.0
  }
}
```

Quando não há apresentação: `data: null` — confirmado.

Campos usados: `id`, `name`, `tags`. O campo `bpm` é ignorado — não há uso
previsto nesta feature nem na de saída. Campos a mais não documentados: `width`,
`height`, `duration`, todos `null` nas observações.

### Situação de cada item que estava aberto

| Item | Resultado |
|---|---|
| `tags` vem sempre, ou pode faltar | ✅ Vem sempre, como **array vazio** quando não há tag. Nunca ausente |
| As tags reais desta igreja indicam cor | ❌ **Não.** `tags: []` em todos os temas observados, e os nomes são genéricos (`Tema 8`, `Tema 9`). A via alternativa de derivar cor das tags **não é viável nesta instalação** — o que confirma a decisão de ler o tema só como observação (FR-005b) |

---

## Recursos descartados

**ETag** (v2.25.0+): não usado. Justificativa em [research.md](../research.md) —
a cor muda a cada leitura, então não haveria economia na consulta mais frequente,
e não há custo a otimizar em `localhost`.

---

## Procedimento de verificação

Executado em 2026-07-28 contra o Holyrics 2.29.1. Os passos 1 a 6 estão
concluídos; ficam registrados para quando houver nova versão da ferramenta.

1. Chamar cada uma das três actions e salvar a resposta bruta.
2. Conferir cada linha marcada "A verificar" acima e substituir por observação.
3. Chamar com token inválido e registrar a resposta exata.
4. Chamar com o Holyrics sem apresentação e registrar as três respostas.
5. Trocar o status de cada seção de **NÃO VERIFICADO** para verificado, com data.
6. Corrigir o código que depender de qualquer suposição que se revelar errada.

### O que ainda falta observar

| Item | Como observar |
|---|---|
| Item sem noção de slide (imagem, vídeo avulso) | Projetar uma imagem fora de música e ler `GetCurrentPresentation` |
| `type: "presentation"` é tela pública ou preview | Deixar as duas com conteúdo diferente e comparar |
| Tamanho relativo de cada região | Projetar um bloco pequeno de cor forte, deslocando-o pela tela |

Resolvidos nesta rodada: ruído contra vídeo (é zero — ver acima), base de
`slide_number` (observado de 1 a 5 em `total_slides: 5`, logo **começa em 1**).

### Os outros valores de `type`

| `type` | Observado |
|---|---|
| `presentation` | A cor do tema. É o que a feature usa |
| `printscreen` | Captura real da tela. **Difere de `presentation`** — `815D0F` contra `B4A010` no mesmo instante, mais escuro, porque inclui o que está sobreposto |
| `background`, `image`, `video` | `null` quando o tema é gerado (cor ou gradiente) em vez de arquivo |

`printscreen` foi considerado e descartado: incluir a letra branca da música
puxaria a cor para o claro e deixaria a luz lavada.

`type: "video"` devolvendo `null` é um detector barato de "há vídeo no ar" — útil
como diagnóstico, se algum dia a cor precisar acompanhar o quadro.

### Achados que não estavam previstos

Registrados aqui porque nenhum deles cabia numa linha "A verificar" — foram
descobertos por observação, não por conferência:

1. **`reg` em vez de `red`** — impedia a feature de funcionar por inteiro.
2. **Média amostrada, não cor predominante** — muda o significado do dado.
3. **Dois erros distintos sob o mesmo HTTP 401** — muda o que o log orienta.
4. **Tema sem tags nesta instalação** — fecha a via alternativa de cor.
