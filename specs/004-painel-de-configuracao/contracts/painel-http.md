# Contrato: HTTP do painel

**Feature**: 004 | **Date**: 2026-07-31

Cinco rotas. Não é API pública — o consumidor é a página servida pelo mesmo
processo, no mesmo repositório, e as duas mudam juntas sem versionamento. Está
escrito porque é a superfície onde entrada de fora encontra o serviço, e porque os
códigos de resposta **são** requisitos.

**Sem autenticação, por decisão registrada** (FR-003, e o risco nomeado em
`spec.md § Riscos aceitos`). Escuta em `127.0.0.1` por padrão (FR-003a).

**Nenhuma rota comanda luz.** Não há caminho daqui até o Freestyler — é o que
preserva a garantia da 002 de que nenhuma fixture fora do grupo seguidor recebe
comando.

---

## `GET /`

A página. `text/html; charset=utf-8`, conteúdo estático vindo de
`src/adapters/painel/pagina.ts`.

Qualquer outro caminho não listado aqui → **404** com corpo em texto. Sem
listagem de diretório, sem servir arquivo do disco — a página não tem caminho para
resolver, então não há travessia possível.

## `GET /api/estado`

Retrato único, para a primeira pintura da tela antes de o SSE conectar.

**200** — `application/json`, corpo é `EstadoDaPágina`
([data-model.md](../data-model.md#nova--estadodapágina)):

```json
{
  "estado": {
    "item": { "id": "…", "tipo": "song", "nome": "…", "slide": 2, "totalDeSlides": 8 },
    "tema": { "id": "…", "nome": "Cana Verde", "tags": ["lento", "verde"] },
    "corDeReferência": { "r": 0, "g": 128, "b": 0 },
    "corExtraída": { "r": 90, "g": 92, "b": 88 },
    "origemDaCor": "mapeada",
    "tagDaCor": "verde",
    "holyricsDisponível": true,
    "freestylerDisponível": true,
    "grupoResolvido": { "nomeReal": "03: Par Led", "índice": 3 },
    "gruposConhecidos": ["01: Movings", "03: Par Led"],
    "últimoSucesso": { "cor": 1753900000000, "item": 1753900000000, "tema": 1753900000000 }
  },
  "config": { "…": "a configuração em execução, sem o token" },
  "hash": "e3b0c44298fc…",
  "discoDivergente": false,
  "sobreposiçõesDeAmbiente": ["log.nivel"]
}
```

`origemDaCor`, `tagDaCor`, `grupoResolvido` e `corExtraída` são `null` quando não
se aplicam. `freestylerDisponível` é `null` quando **não há saída DMX
configurada** — que é diferente de `false`, e a página MUST dizer coisas
diferentes nos dois casos.

## `GET /api/eventos`

Fluxo SSE. `text/event-stream`, `Cache-Control: no-cache`, `Connection:
keep-alive`.

Um `event: estado` a cada ciclo de leitura, com o mesmo corpo de
`GET /api/estado` no campo `data`. Comentário `:keepalive` a cada 20 s, para
atravessar proxies e provar que o canal está vivo.

O servidor mantém as respostas abertas num conjunto e as encerra em:

- `SIGINT`/`SIGTERM`;
- troca do endereço de escuta (FR-018a) — aí o `EventSource` do navegador tenta
  reconectar sozinho, e é isso que faz a aba antiga se comportar de forma
  previsível.

## `GET /api/config`

Configuração em execução mais o hash a devolver na submissão.

**200** — `{ "config": …, "hash": "…", "discoDivergente": false,
"sobreposiçõesDeAmbiente": [...] }`

`discoDivergente: true` significa que o arquivo mudou desde o carregamento e que
esses valores **ainda não estão valendo** (FR-023a). É o sinal que a página exibe.

## `PUT /api/config`

A única rota que escreve. Corpo:

```json
{ "config": { "…": "a configuração proposta, inteira" },
  "hashBase": "e3b0c44298fc…",
  "forcar": false }
```

`config` é a configuração **inteira**, não um remendo. O que ela não mencionar e
o arquivo tiver é preservado na mesclagem (FR-025), mas isso é sobre chaves
desconhecidas do esquema — não é canal para submissão parcial, que a FR-012
proíbe.

### Respostas

| Código | Quando | Corpo | Requisito |
|---|---|---|---|
| **200** | aceita | `{ "hash": novo, "camposAlterados": [...], "efeitos": [...] }` | FR-017, FR-022 |
| **409** | `hashBase` difere do arquivo e `forcar` é falso | `{ "erro": "conflito", "hashAtual": "…" }` | FR-026 |
| **422** | validação recusou | `{ "erro": "invalida", "detalhe": "leitura.regiao: …" }` | FR-012 |
| **500** | gravação falhou | `{ "erro": "gravacao", "detalhe": "…" }` | FR-027 |

**409 e 422 são erros diferentes de propósito.** Um pede decisão do operador
(FR-026a: sobrescrever ou descartar), o outro pede correção de valor. Colapsá-los
num único código repetiria o defeito que a verificação da 001 achou no Holyrics —
dois erros distintos sob o mesmo status, pedindo ações opostas.

**Em 409, 422 e 500, o arquivo não é tocado e a configuração em execução não muda**
(FR-013, FR-027). Não há resposta que deixe o serviço num estado misto.

### Ordem das verificações, e por que ela é esta

```
1. corpo é JSON válido        → senão 422
2. validação de configuração  → senão 422        (a MESMA de carregarConfig, FR-011)
3. hash contra o arquivo AGORA → senão 409       (fecha a janela entre validar e escrever)
4. mesclagem sobre o JSON bruto do disco          (FR-025)
5. gravação atômica: temporário → fsync → rename  (FR-024)
6. diff → efeitos → aplicação                     (FR-018)
7. log dos campos alterados                       (FR-022)
```

A validação vem **antes** da checagem de hash porque uma submissão inválida deve
ser recusada como inválida, não como conflito — o operador precisa saber o que
digitou errado antes de decidir de quem é a versão que vale.

O hash é conferido no passo 3, contra o disco naquele instante, e não contra o que
foi lido no início da requisição.

### Sobre mensagens de erro (FR-016)

`detalhe` traz o caminho do campo e a descrição do problema, **nunca o valor
recebido**. É a mesma regra do formatador já usado na validação
([config.ts:131](../../../src/adapters/config.ts)), e existe para que uma
credencial posta por engano num campo de configuração não apareça em log — nem,
agora, numa resposta HTTP.
