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
    "heartbeatTimeoutMs": 6000,
    "consultaTimeoutMs": 2000
  }
}
```

| Campo | Tipo | Obrigatório | Padrão | Regra |
|---|---|---|---|---|
| `host` | string | não | `localhost` | Nunca fixo no código (FR-023) |
| `port` | inteiro | não | `3332` | 1–65535. Configurável apesar do padrão do Freestyler |
| `grupo` | string | **sim** | — | Com o bloco presente, o nome é exigido; sua ausência é erro de configuração, não modo de operação (FR-008a) |
| `corDeRepouso` | objeto | **sim** | — | Componentes 0–255. Preto é válido e significa apagar (FR-026b) |
| `heartbeatTimeoutMs` | inteiro | não | `6000` | MUST ser ≥ **4500**, para tolerar três batimentos de ~1499 ms com folga (FR-021b) |
| `consultaTimeoutMs` | inteiro | não | `2000` | Prazo de resposta de uma consulta `FSBC` (FR-023a) |

## Validações entre campos

1. **`grupo` e `corDeRepouso` exigidos quando o bloco existe** (FR-008a,
   FR-026a). O bloco é o interruptor da feature: presente significa comandar, e
   comandar exige saber qual grupo e qual neutro. Não há neutro implícito — o que
   é neutro depende da instalação.
2. **`heartbeatTimeoutMs` ≥ 4500.** O pulso observado é de ~1499 ms. Três
   batimentos são 4497 ms, então 4500 dá margem real; o valor anterior desta
   regra era 3000, que cobre exatamente dois batimentos com **2 ms** de folga —
   um GC mais longo bastaria para declarar queda falsa.
3. **`consultaTimeoutMs` ≤ metade de `heartbeatTimeoutMs`** (FR-023a). A consulta
   precisa desistir antes de a mesa ser declarada morta; invertida, a ordem dos
   diagnósticos no log fica enganosa. Com os padrões, 2000 contra 6000.
4. **Bloco `freestyler` ausente por completo** é configuração legítima e é a
   **única** forma de desligar a saída — é o estado do projeto antes desta
   feature. O serviço roda como a 001 sozinha (FR-008a).

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
| `grupo` existe mas está vazio | Log com o número de fixtures atingidas pela seleção; zero vira aviso explícito (FR-025b) |
| Consulta `FSBC` sem resposta no prazo | Tratada como falha de envio, com reagendamento por backoff; não bloqueia a saída (FR-023a, FR-029a) |
| `grupo` casa com mais de um | Log com os conflitantes; segue rodando sem comandar (FR-009c) |
| Freestyler fechado | Reconexão com backoff; segue rodando (FR-018, FR-019) |
