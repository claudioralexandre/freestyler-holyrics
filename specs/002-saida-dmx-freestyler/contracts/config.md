# Contrato: configuração da saída DMX

**Feature**: 002-saida-dmx-freestyler | **Data**: 2026-07-29

Estende o arquivo já usado pela 001 (FR-022). **Não há segundo arquivo, não há
flag de linha de comando, não há variável de ambiente nova.**

---

## Bloco novo

```json
{
  "freestyler": {
    "host": "localhost",
    "port": 3332,
    "grupo": "03: Par Led",
    "corDeRepouso": { "r": 0, "g": 0, "b": 0 },
    "heartbeatTimeoutMs": 6000
  }
}
```

| Campo | Tipo | Obrigatório | Padrão | Regra |
|---|---|---|---|---|
| `host` | string | não | `localhost` | Nunca fixo no código (FR-023) |
| `port` | inteiro | não | `3332` | 1–65535. Configurável apesar do padrão do Freestyler |
| `grupo` | string | **não** | — | Ausente significa "não comandar luz"; o serviço sobe e consome eventos normalmente |
| `corDeRepouso` | objeto | **sim, se `grupo` presente** | — | Componentes 0–255. Preto é válido e significa apagar (FR-026b) |
| `heartbeatTimeoutMs` | inteiro | não | `6000` | MUST ser ≥ **4500**, para tolerar três batimentos de ~1499 ms com folga (FR-021b) |

## Validações entre campos

1. **`corDeRepouso` exigida quando há `grupo`** (FR-026a). Não há neutro
   implícito: o que é neutro depende da instalação e é escolha explícita do
   operador.
2. **`heartbeatTimeoutMs` ≥ 4500.** O pulso observado é de ~1499 ms. Três
   batimentos são 4497 ms, então 4500 dá margem real; o valor anterior desta
   regra era 3000, que cobre exatamente dois batimentos com **2 ms** de folga —
   um GC mais longo bastaria para declarar queda falsa.
3. **Bloco `freestyler` ausente por completo** é configuração legítima — é o
   estado do projeto antes desta feature. O serviço roda como a 001 sozinha.

## O que deliberadamente NÃO está aqui

| Não existe | Por quê |
|---|---|
| Endereço DMX, offsets de canal | O Freestyler responde o patch; duplicá-lo criaria segunda fonte de verdade (FR-009) |
| Lista de fixtures | Idem. O que importa é o grupo |
| Universo DMX | Endereçamento é problema da mesa |
| Intervalo mínimo entre envios | Não-requisito declarado (FR-031) |
| Duração de fade | Não existe caminho para fade no protocolo (FR-013a) |
| Modo de calibração | Removido em 2026-07-29; o inventário vai para o log |

## Mensagens de erro

A validação MUST identificar o campo pelo caminho e **nunca ecoar o valor
recebido** — regra herdada da 001, onde o token do Holyrics não pode vazar. Aqui
nenhum campo é segredo, mas a regra é do formatador, não do campo.

Casos que não são erro de configuração e sim de operação, tratados em runtime com
log acionável em vez de recusa de subida:

| Situação | Comportamento |
|---|---|
| `grupo` não existe no Freestyler | Log com o nome procurado e a lista dos existentes; segue rodando sem comandar (FR-010, FR-010a) |
| `grupo` casa com mais de um | Log com os conflitantes; segue rodando sem comandar (FR-009c) |
| Freestyler fechado | Reconexão com backoff; segue rodando (FR-018, FR-019) |
