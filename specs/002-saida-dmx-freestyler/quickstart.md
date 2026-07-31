# Quickstart — validação da saída DMX

**Feature**: 002-saida-dmx-freestyler | **Data**: 2026-07-29

Cenários que provam a feature ponta a ponta. Os cenários 1 e 2 rodam **sem
Freestyler e sem Holyrics**; os demais exigem a mesa.

## Pré-requisitos

- Node.js 22+, dependências instaladas (`./scripts/install.sh` ou `install.ps1`)
- Bloco `freestyler` em `config/config.json` — ver [contracts/config.md](contracts/config.md)
- Para os cenários 3 em diante: Freestyler aberto, com um grupo montado contendo
  ao menos uma fixture RGB

---

## Cenário 1 — A lógica roda sem nada ligado

```bash
npm test
```

**Esperado**: suíte inteira verde, incluindo os testes novos de `grupo`,
`saida`, `heartbeat` e `protocolo`. Nenhum teste abre socket.

É a prova do Princípio II: a decisão de cor, a resolução de grupo e a semântica
de toggle são verificáveis sem Freestyler, sem Holyrics e sem fixture.

## Cenário 2 — Configuração inválida não sobe

Ponha `heartbeatTimeoutMs: 1000` no config e suba o serviço.

**Esperado**: recusa de subida citando o campo e a regra (mínimo 4500), sem
ecoar valores de outros campos.

Repita com `grupo` presente e `corDeRepouso` ausente. **Esperado**: mesma recusa,
citando a dependência entre os dois campos.

Repita com o bloco `freestyler` presente e **sem** `grupo`. **Esperado**: recusa
citando o campo — bloco preenchido pela metade é erro, não modo de operação
(FR-008a). Depois remova o bloco **inteiro**: aí o serviço sobe, consome eventos
e não comanda luz nenhuma.

Repita com `heartbeatTimeoutMs: 6000` e `consultaTimeoutMs: 4000`. **Esperado**:
recusa citando os dois campos — a consulta tem que desistir antes de a mesa ser
declarada morta (FR-023a).

## Cenário 3 — Inventário no log, e quais fixtures a seleção pega

Suba o serviço com o Freestyler aberto.

**Esperado**, em nível normal: uma linha com a versão do Freestyler, os nomes dos
grupos encontrados, e qual foi resolvido como seguidor.

É o que substitui a antiga ferramenta de calibração: o operador confere o
mapeamento lendo o log, sem acender nada.

Provoque a primeira cor e leia a linha `seleção efetivada`. **Esperado**: o
número de fixtures atingidas e o nome de cada uma, batendo com o que o Freestyler
mostra para aquele grupo.

Agora aponte `grupo` para um grupo que **existe e está vazio** e provoque uma cor.
**Esperado**: aviso `grupo seguidor existe mas está vazio`, com
`fixturesAtingidas: 0` (SC-012). Sem essa linha, grupo vazio e integrador
quebrado teriam exatamente o mesmo sintoma — luz parada.

## Cenário 4 — Nome de grupo errado é diagnosticável

Troque `grupo` para um nome inexistente e suba.

**Esperado**:

- o processo **não** morre
- o log nomeia o que foi procurado e lista os grupos existentes
- nenhum comando chega ao Freestyler

Agora corrija o nome **no Freestyler** (crie um grupo com aquele nome), sem
reiniciar o serviço, e provoque uma mudança de cor.

**Esperado**: o integrador resolve o grupo na tentativa seguinte e passa a
comandar (FR-011a).

## Cenário 5 — Nada é comandado antes da primeira cor

Com o Holyrics **sem apresentação**, anote o status de grupos do Freestyler,
suba o serviço, espere um minuto e leia o status de novo.

**Esperado**: status idêntico. Nenhum grupo foi selecionado, nenhuma cor foi
escrita, e o log diz que se aguarda a primeira cor (FR-027, FR-027b, SC-011).

Este cenário existe porque a decisão foi **revertida** durante a clarificação —
vale verificar que a reversão pegou.

## Cenário 6 — Cor no palco, e só no grupo certo

Ponha uma apresentação colorida no Holyrics.

**Esperado**:

- as fixtures do grupo seguidor assumem a cor em até 1 segundo (SC-001)
- as fixtures **fora** do grupo não mudam (SC-002)
- o log detalhado permite reconstruir cor de origem, grupo e valor de cada slot

Troque para uma apresentação de cor bem diferente e confirme que acompanha.

## Cenário 7 — O toggle não apaga a luz

Este é o cenário que a verificação salvou. Deixe a apresentação trocando de cor
várias vezes seguidas — pelo menos seis mudanças.

**Esperado**: a luz acompanha **todas**. Se apagar em uma sim, uma não, a
implementação está enviando o comando de grupo sem ler o status antes
(FR-012a).

## Cenário 8 — Encerrar a apresentação leva ao repouso

Feche a apresentação no Holyrics.

**Esperado**: as fixtures do grupo assumem a `corDeRepouso` em até 1 segundo
(SC-008). Se ela for preta, apagam.

Reabra uma apresentação e confirme que voltam a seguir a cor.

## Cenário 9 — Freestyler ausente não derruba nada

Feche o Freestyler com o serviço rodando.

**Esperado**:

- o processo continua vivo
- o log registra a perda **uma vez**, não a cada tentativa
- a detecção vem da ausência de heartbeat, em até `heartbeatTimeoutMs`

Reabra o Freestyler.

**Esperado**: reconexão automática, e as fixtures assumem a **cor corrente** — não
a fila de cores que passaram durante a queda (SC-004, FR-020).

## Cenário 10 — Encerrar não comanda nada

Com a luz acesa em alguma cor, pare o serviço.

**Esperado**: as fixtures permanecem exatamente como estavam. Nenhum comando é
enviado na saída (FR-028).

---

## Critérios de sucesso cobertos

| Cenário | Critérios |
|---|---|
| 1 | — (Princípio II) |
| 2 | SC-006 parcial |
| 3 | SC-009, SC-012 |
| 4 | SC-006 |
| 5 | SC-011 |
| 6 | SC-001, SC-002, SC-007 |
| 7 | SC-001 sob repetição |
| 8 | SC-008 |
| 9 | SC-003, SC-004, SC-010 |
| 10 | — (FR-028) |

**SC-005** (zero comandos com a cor parada por 30 min) é verificado deixando o
serviço rodando e contando linhas de envio no log.
