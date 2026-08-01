# Data Model: Painel de configuração

**Feature**: 004 | **Date**: 2026-07-31 | **Plan**: [plan.md](plan.md)

Quatro entidades novas e duas alteradas. As alteradas importam mais que as novas:
é nelas que a feature toca código que já roda em culto.

---

## Alterada — `EstadoObservável` (`src/service/runtime.ts`)

O que a FR-005 e a FR-009 pedem, contra o que existe hoje.

| Campo | Hoje | Depois | Vem de |
|---|---|---|---|
| `item`, `slide`, `totalDeSlides`, `tema` | ✔ | igual | núcleo |
| `holyricsDisponível` | ✔ | igual | `availability.ts` |
| `últimoSucesso` | ✔ | igual | núcleo |
| `corDeReferência` | ✔ | igual — **é a cor efetiva** | núcleo |
| `corExtraída` | ✖ | **novo** — `Cor \| null` | núcleo (§ abaixo) |
| `origemDaCor` | ✖ | **novo** — `'extraida' \| 'mapeada' \| null` | núcleo |
| `tagDaCor` | ✖ | **novo** — `string \| null` | núcleo |
| `freestylerDisponível` | ✖ | **novo** — `boolean \| null` | serviço; `null` = saída DMX desligada |
| `grupoResolvido` | ✖ | **novo** — `{ nomeReal, índice } \| null` | `saida-dmx.ts` |
| `gruposConhecidos` | ✖ | **novo** — `readonly string[]` | `saida-dmx.ts`, para a FR-009 |

`null` em `freestylerDisponível` **não** é "indisponível": é "não há saída DMX
configurada". A distinção existe porque a página precisa dizer "você não
configurou" e "está fora do ar" de formas diferentes — são ações opostas do
operador, e a 001 já aprendeu essa lição com os dois erros sob o mesmo HTTP 401.

## Alterada — `EstadoDoServiço` (`src/core/state.ts`)

Ganha três campos, e a razão é que hoje eles só existem dentro do evento
`cor_anunciada` — que é instantâneo. Entre dois anúncios, a página não teria de
onde ler.

```
+ readonly corExtraída: Cor | null       // última extração bem-sucedida
+ readonly origemDaCor: OrigemDaCor | null
+ readonly tagDaCor: string | null
```

**Regra de preenchimento** — e é onde mora o erro fácil:

- `corExtraída` guarda a **última extração bem-sucedida**, e sobrevive a um ciclo
  cuja leitura de cor falhou. Não é "a cor extraída neste ciclo".
- `origemDaCor` e `tagDaCor` descrevem a origem de `corDeReferência` — ou seja, da
  cor que **está valendo**, não da leitura do ciclo. Quem sob override lê a tag do
  ciclo corrente mostraria a tag certa antes de a cor mapeada ter sido confirmada
  pela permanência.
- Os três acompanham `corDeReferência` quando ela é descartada por troca de
  contexto (`descartarCor` em [state.ts:143](../../src/core/state.ts)): voltam a
  `null` junto.

`stability.ts` **continua intocado**. Os campos novos são registro, não entrada de
decisão — é a mesma garantia estrutural que a 003 estabeleceu, e ela precisa
sobreviver a esta feature.

## Nova — `ConfiguraçãoViva` (`src/service/painel.ts`)

O valor que substitui "a configuração é constante durante a vida do processo".

| Campo | Tipo | Papel |
|---|---|---|
| `atual` | `Config` | o que está valendo agora — a "Configuração em execução" da spec |
| `bruto` | `Record<string, unknown>` | o JSON como está no disco, com chaves desconhecidas (FR-025) |
| `hash` | `string` | SHA-256 do conteúdo lido, base da detecção de conflito (FR-026) |
| `caminho` | `string` | de onde veio; já devolvido por `carregarConfig` |

Muda **apenas** por submissão aceita. Edição do arquivo por fora não a altera
(FR-023a) — só faz `hash` divergir do disco, que é o sinal que a página mostra.

## Nova — `Submissão`

O que a página manda. Vira `ConfiguraçãoViva` apenas inteira, ou não vira nada.

| Campo | Tipo | Papel |
|---|---|---|
| `config` | `unknown` | a configuração proposta, ainda não validada |
| `hashBase` | `string` | o hash que a página carregou |
| `forcar` | `boolean` | `true` = "sobrescrever assim mesmo" da FR-026a |

**Ciclo de vida** — cinco saídas, e cada uma é um requisito:

```
recebida
   ├─ inválida ──────────────→ recusada por inteiro    (FR-012, FR-013)
   ├─ hash difere e !forcar ─→ conflito                (FR-026, FR-026a)
   ├─ gravação falha ────────→ falha de escrita        (FR-027)
   ├─ nada mudou ────────────→ aceita, zero efeitos    (FR-019)
   └─ aceita ────────────────→ efeitos aplicados       (FR-017, FR-018, FR-022)
```

Nenhuma saída intermediária existe. Não há estado "parcialmente aplicada" — é a
FR-012, e é o motivo de a fusão da FR-026a ter sido recusada.

## Nova — `CampoAlterado` e `Efeito` (`src/core/recarga.ts`)

`CampoAlterado` é um caminho em texto: `leitura.regiao`, `freestyler.grupo`,
`coresPorTag`. Produzido por comparação profunda entre dois registros.

### Efeitos de recarga

```
type Efeito =
  | 'ritmo_de_leitura'
  | 'parametros_do_nucleo'
  | 'zerar_estado_de_cor'
  | 'reconectar_holyrics'
  | 'reconectar_freestyler'
  | 'reresolver_grupo'
  | 'parametros_da_saida'
  | 'religar_saida'
  | 'parametros_de_reconexao'
  | 'reconfigurar_log'
  | 're_servir_painel'
  | 'desconhecido'
```

| Efeito | O que faz | Requisito |
|---|---|---|
| `ritmo_de_leitura` | próximo ciclo usa o intervalo novo; o ciclo em curso termina | FR-018 |
| `parametros_do_nucleo` | substitui `ParâmetrosDoNúcleo` do próximo ciclo | FR-018 |
| `zerar_estado_de_cor` | referência, candidata e contagem a zero | **FR-021a**, só `leitura.regiao` |
| `reconectar_holyrics` | fecha e refaz o cliente HTTP; nada mais é tocado | FR-018 |
| `reconectar_freestyler` | fecha o socket e reconecta; grupo é reresolvido junto | FR-018 |
| `reresolver_grupo` | resolve o nome contra a mesa; resultado vai para página e log | FR-018, FR-009 |
| `parametros_da_saida` | `SaídaDMX.atualizarParâmetros()`, depois do envio em curso | FR-020 |
| `religar_saida` | bloco `freestyler` apareceu ou sumiu: monta ou desmonta a saída | 002/FR-008a |
| `parametros_de_reconexao` | novo backoff nas próximas tentativas | FR-018 |
| `reconfigurar_log` | nível e destino passam a valer nos registros seguintes | FR-018, FR-016a |
| `re_servir_painel` | escuta no endereço novo; se não abrir, recusa e mantém o antigo | **FR-018a** |
| `desconhecido` | registra em log que o campo mudou sem efeito conhecido | ver abaixo |

**`desconhecido` não é rede de segurança — é alarme.** Um campo acrescentado numa
feature futura seria aceito pela página, gravado no arquivo e simplesmente não
valeria. Um padrão silencioso tornaria isso indetectável; o efeito nomeado o
transforma numa linha de log.

## Nova — `EstadoDaPágina`

O que a rota de estado devolve. É composição, não armazenamento: montado a cada
pedido a partir de `runtime.snapshot()` e da `ConfiguraçãoViva`.

| Campo | Origem |
|---|---|
| `estado` | `runtime.snapshot()`, já estendido |
| `config` | `ConfiguraçãoViva.atual` — **sem token, por construção** |
| `hash` | `ConfiguraçãoViva.hash` |
| `discoDivergente` | `true` quando o hash do arquivo difere do carregado (FR-023a) |
| `sobreposiçõesDeAmbiente` | lista de caminhos sobrepostos por variável de ambiente — hoje só `log.nivel` sob `LOG_LEVEL` (FR-016a) |

**Sobre o token e a FR-015:** não há campo a omitir, filtro a aplicar nem teste de
regressão a escrever. `carregarConfig` devolve `{ config, token, caminho }` como
irmãos ([config.ts:262](../../src/adapters/config.ts)); o token nunca esteve
dentro de `Config`. Serializar `Config` não tem como vazá-lo — a garantia é
estrutural, e mantê-la assim vale mais que qualquer verificação.

## Configuração — bloco novo `painel`

```
painel?: {
  habilitado?: boolean   // default true   (FR-004)
  host?: string          // default "127.0.0.1" (FR-003a)
  port?: number          // default 3333
}
```

**A convenção é o oposto da do bloco `freestyler`, e de propósito.** Na 002, a
ausência do bloco desliga a feature. Aqui, a ausência **liga** com os padrões —
porque a FR-004 observou que a outra convenção é circular: o operador descobriria
que a página existe abrindo o arquivo que a página existe para ele não abrir.

`3333` é vizinho do `3332` do Freestyler, que é o número que o operador já tem na
cabeça. Colisão de porta não derruba nada (FR-004a).

Escutar em `0.0.0.0` — ou em qualquer coisa que não seja laço local — obriga o
aviso de subida da FR-003b.
