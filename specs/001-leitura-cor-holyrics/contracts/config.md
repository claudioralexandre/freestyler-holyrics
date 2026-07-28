# Contrato de configuração

**Feature**: 001-leitura-cor-holyrics | **Data**: 2026-07-28

Configuração em arquivo JSON, credencial em variável de ambiente. Validada na
inicialização; configuração inválida impede a partida com mensagem explícita
(FR-020) — é a única condição que legitimamente termina o processo.

---

## Credencial

**Variável de ambiente `HOLYRICS_TOKEN`.** Nunca no arquivo de configuração,
nunca no git, nunca em log (FR-019, SC-007).

Ausente ou vazia → o serviço não inicia, com mensagem que nomeia a variável e
**não** ecoa valor algum.

O logger aplica redação: qualquer campo cujo nome contenha `token` é substituído
antes da escrita, para que uma URL registrada por engano não vaze a credencial.

---

## Variáveis de ambiente

Três, e só três. Não há flags de linha de comando — o serviço roda como processo
headless iniciado por atalho ou script, onde argumentos são mais fáceis de perder
do que ambiente.

| Variável | Obrigatória | Efeito |
|---|---|---|
| `HOLYRICS_TOKEN` | Sim | Credencial. Nunca no arquivo, nunca em log |
| `CONFIG_PATH` | Não | Sobrepõe o caminho do arquivo de configuração |
| `LOG_LEVEL` | Não | Sobrepõe `log.nivel` do arquivo. É o que permite subir em `debug` para calibração sem editar a config |

`LOG_LEVEL` aceita os mesmos valores de `log.nivel`; valor inválido impede a
partida, como qualquer configuração inválida (FR-020).

## Arquivo

Caminho padrão: `./config/config.json`. Sobreponível por `CONFIG_PATH`.
O arquivo real fica fora do git; `config/config.example.json` é o modelo
versionado.

```json
{
  "holyrics": {
    "host": "localhost",
    "port": 8080,
    "requestTimeoutMs": 800
  },
  "leitura": {
    "intervaloMs": 1000,
    "regiao": 0
  },
  "cor": {
    "limiarDeltaE": 10,
    "ciclosDeConfirmacao": 2
  },
  "reconexao": {
    "intervaloInicialMs": 1000,
    "intervaloMaximoMs": 15000
  },
  "log": {
    "nivel": "info",
    "arquivo": "./logs/integrador.log",
    "tamanhoMaximoMb": 10,
    "arquivosMantidos": 5
  }
}
```

---

## Campos

| Campo | Tipo | Padrão | Regra | Requisito |
|---|---|---|---|---|
| `holyrics.host` | texto | `localhost` | Não vazio | FR-018 |
| `holyrics.port` | inteiro | — | 1–65535, obrigatório | FR-018 |
| `holyrics.requestTimeoutMs` | inteiro | `800` | > 0 e **estritamente menor** que `leitura.intervaloMs` | FR-004 |
| `leitura.intervaloMs` | inteiro | `1000` | ≥ 250 | FR-001 |
| `leitura.regiao` | inteiro | `0` | 0–7 | FR-002 |
| `cor.limiarDeltaE` | número | `10` | > 0 | FR-007 |
| `cor.ciclosDeConfirmacao` | inteiro | `2` | ≥ 1 | FR-007a |
| `reconexao.intervaloInicialMs` | inteiro | `1000` | > 0 | FR-015 |
| `reconexao.intervaloMaximoMs` | inteiro | `15000` | ≥ inicial, ≤ 30000 | FR-015, FR-015a |
| `log.nivel` | enum | `info` | `debug`\|`info`\|`warn`\|`error` | FR-013g |
| `log.arquivo` | caminho | `./logs/integrador.log` | Diretório criável | FR-013d |
| `log.tamanhoMaximoMb` | inteiro | `10` | > 0 | FR-013e |
| `log.arquivosMantidos` | inteiro | `5` | ≥ 1 | FR-013e |

### Validações entre campos

Três regras não valem por campo isolado e são verificadas juntas:

1. **`requestTimeoutMs < intervaloMs`** — um tempo limite maior que o intervalo
   garantiria ciclos se atropelando, contra a FR-004.
2. **`intervaloMaximoMs ≤ 30000`** — o SC-005 promete retomada em 30 segundos.
   Um teto maior tornaria o critério inalcançável por construção (FR-015a).
3. **`intervaloMaximoMs ≥ intervaloInicialMs`** — caso contrário o backoff
   diminuiria a cada falha.

### Valores que ainda são chute

`leitura.regiao` e `cor.limiarDeltaE` estão no arquivo com valores plausíveis,
**não calibrados**. Ambos dependem de observação contra o Holyrics real (FR-021,
seção de pendências em [research.md](../research.md)). O padrão `0` para região é
arbitrário — a documentação não diz qual índice corresponde a qual parte da tela.

---

## Comportamento na inicialização

| Situação | Resultado |
|---|---|
| `HOLYRICS_TOKEN` ausente | Não inicia. Mensagem nomeia a variável |
| Arquivo de config ausente | Não inicia. Mensagem traz o caminho procurado e aponta o exemplo |
| JSON malformado | Não inicia. Mensagem traz linha/coluna |
| Campo fora da regra | Não inicia. Mensagem traz caminho do campo, valor recebido e o esperado |
| `LOG_LEVEL` com valor inválido | Não inicia. Mensagem lista os níveis aceitos |
| Validação entre campos falha | Não inicia. Mensagem nomeia os dois campos em conflito |
| Holyrics fechado | **Inicia normalmente** e entra em reconexão (FR-014) |
| Diretório de log não criável | Inicia; registra no terminal e segue sem arquivo (FR-013i) |

A última linha é deliberada: falta de log é degradação, não motivo para o serviço
não subir durante um culto.
