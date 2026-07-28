# Contrato consumido: Holyrics API Server

**Feature**: 001-leitura-cor-holyrics | **Levantado em**: 2026-07-28

> # ⚠️ NÃO VERIFICADO
>
> **Nada neste arquivo foi confirmado contra um Holyrics em execução.** Todo o
> conteúdo vem da documentação pública em `https://github.com/holyrics/API-Server`.
>
> O Princípio I da constitution permite implementar sobre contrato não verificado
> **apenas enquanto a suposição estiver explicitamente marcada** — é o que este
> bloco faz. A verificação contra a ferramenta real é obrigatória antes de a
> feature ser considerada pronta, e **este arquivo é o artefato a ser corrigido**
> quando ela acontecer.
>
> Cada seção abaixo traz seu próprio status. Ao verificar, troque o status da
> seção e registre o que foi observado de fato — inclusive quando bater com o
> esperado.

---

## Transporte

**Status: NÃO VERIFICADO**

```
POST http://{host}:{porta}/api/{action}?token={token}
Content-Type: application/json

{ ...parâmetros da action... }
```

- Host e porta vêm da configuração, nunca fixos (Restrições Técnicas).
- O token vai na query string. Aceitável porque a comunicação é `localhost` e não
  atravessa rede.
- O modo alternativo com hash (`dtoken = sha256(nonce + ':' + rid + ':' + token +
  ':' + data)`) existe e foi descartado — ver [research.md](../research.md).

**A verificar**: se o Holyrics aceita corpo vazio quando a action não tem
parâmetros, e se rejeita `GET`.

---

## Envelope de resposta

**Status: NÃO VERIFICADO**

Sucesso:

```json
{ "status": "ok", "data": {} }
```

Erro:

```json
{ "status": "error", "error": "invalid token" }
```

**A verificar, e é o ponto mais frágil do contrato**: a string exata devolvida
quando o token é recusado. A classificação `credencial_recusada` depende dela
(FR-017). Até a verificação, a regra é conservadora — qualquer `status: "error"`
não reconhecido vira falha parcial, nunca queda, para não confundir "erro de
action" com "Holyrics caiu".

**A verificar também**: qual código HTTP acompanha o erro de token (200 com
envelope de erro, ou 401/403).

---

## Action: `GetColorMap`

**Status: NÃO VERIFICADO** — é a action mais importante da feature e a de maior
incerteza.

Requisição:

```json
{ "type": "presentation" }
```

Resposta:

```json
{
  "status": "ok",
  "data": [
    { "hex": "0000FF", "red": 0, "green": 0, "blue": 255 }
  ]
}
```

### O que isto corrige na spec

`data` é um **array de 8 posições**, uma por seção da imagem. **Não há região
nomeada.** A spec fala em "região indicada na configuração" — na prática isso é
um **índice inteiro de 0 a 7**.

Consequência para a FR-002a: quando o índice configurado não existe no array
recebido, a leitura é descartada e o log informa quantas posições vieram — não
"quais regiões existem", que não é informação que a API forneça.

### A verificar

| Item | Por quê |
|---|---|
| São de fato 8 posições, sempre | O desenho da config depende disso |
| Qual índice corresponde a qual parte da tela | A documentação não diz; é o objeto da calibração |
| Componentes são 0–255 inteiros | A validação de entrada assume isso |
| O que vem quando não há apresentação na tela | `data: null`? array de pretos? erro? Determina se a cor precisa de tratamento próprio de "sem apresentação" |
| Se `type: "presentation"` reflete a tela pública ou a de preview | Ler a tela errada faz a feature inteira parecer quebrada |

Outros valores de `type` (`background`, `image`, `video`, `printscreen`) existem e
não são usados por esta feature.

---

## Action: `GetCurrentPresentation`

**Status: NÃO VERIFICADO**

Requisição: sem parâmetros.

Resposta:

```json
{
  "status": "ok",
  "data": {
    "id": "abc123",
    "type": "song",
    "name": "",
    "slide_number": 1,
    "total_slides": 10,
    "slide_type": "default",
    "slides": []
  }
}
```

Quando não há apresentação: `data: null` — estado legítimo, não é erro (FR-003).

Campos usados: `id`, `type`, `name`, `slide_number`, `total_slides`. Os campos
`slide_type` e `slides` são ignorados.

### A verificar

| Item | Por quê |
|---|---|
| `id` é estável enquanto o item está em exibição | A detecção de troca de item depende disso; um `id` que muda a cada slide geraria evento errado |
| `slide_number` começa em 0 ou 1 | Afeta a leitura do log, não a lógica |
| Itens sem slides (imagem, vídeo) trazem o quê nesses campos | Determina o caso "item sem noção de slide" |
| `name` vem vazio com frequência | O exemplo da documentação traz `""`; se for comum, o log precisa cair para o `id` |

---

## Action: `GetCurrentTheme`

**Status: NÃO VERIFICADO**

Requisição: sem parâmetros.

Resposta:

```json
{
  "status": "ok",
  "data": {
    "id": "123",
    "type": "theme",
    "name": "Theme Name",
    "tags": ["circle", "blue"],
    "bpm": 80
  }
}
```

Quando não há apresentação: `data: null`.

Campos usados: `id`, `name`, `tags`. O campo `bpm` é ignorado — não há uso
previsto nesta feature nem na de saída.

### A verificar

| Item | Por quê |
|---|---|
| `tags` vem sempre, ou pode faltar | A validação precisa aceitar ausência sem virar `resposta_invalida` |
| As tags reais desta igreja indicam cor | É a razão de o tema estar sendo lido; define se a via alternativa é viável |

---

## Recursos descartados

**ETag** (v2.25.0+): não usado. Justificativa em [research.md](../research.md) —
a cor muda a cada leitura, então não haveria economia na consulta mais frequente,
e não há custo a otimizar em `localhost`.

---

## Procedimento de verificação

Quando houver acesso a um Holyrics em execução, com uma apresentação no telão:

1. Chamar cada uma das três actions e salvar a resposta bruta.
2. Conferir cada linha marcada "A verificar" acima e substituir por observação.
3. Chamar com token inválido e registrar a resposta exata.
4. Chamar com o Holyrics sem apresentação e registrar as três respostas.
5. Trocar o status de cada seção de **NÃO VERIFICADO** para verificado, com data.
6. Corrigir o código que depender de qualquer suposição que se revelar errada.
