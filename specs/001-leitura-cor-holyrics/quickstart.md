# Quickstart — Leitura de cor do Holyrics

**Feature**: 001-leitura-cor-holyrics | **Data**: 2026-07-28

Como rodar e como provar que a feature faz o que a spec promete. Os cenários
estão em ordem de dependência: os dois primeiros rodam em qualquer máquina, os
demais exigem o Holyrics.

---

## Pré-requisitos

| Para | Precisa de |
|---|---|
| Cenários 1 e 2 | Node.js 22+ apenas |
| Cenários 3 a 7 | Windows com Holyrics em execução, API Server ativo, token em mãos |

---

## Instalação

```bash
npm install
```

Configuração inicial:

```bash
cp config/config.example.json config/config.json
```

O token vai no ambiente, nunca no arquivo:

```bash
export HOLYRICS_TOKEN=seu-token-aqui
```

No Windows (PowerShell):

```powershell
$env:HOLYRICS_TOKEN = "seu-token-aqui"
```

---

## Cenário 1 — O núcleo passa sem Holyrics (SC-006)

Prova o Princípio II e o SC-006: toda a lógica de decisão roda sem rede, sem
Holyrics e sem fixture ligada.

```bash
npm test
```

**Esperado**: suíte verde, cobrindo os cenários de aceitação das US1–US3 —
seleção de região, ΔE, limiar, descarte de salto passageiro, adoção da última
leitura da sequência, primeira leitura sem confirmação, diffing de item/slide, e
o silêncio de cor numa troca de item de cor parecida.

Se esta suíte precisar de rede para passar, o Princípio II foi violado em algum
ponto.

---

## Cenário 2 — Configuração inválida não sobe (FR-020)

```bash
CONFIG_PATH=/caminho/inexistente.json npm start
```

**Esperado**: o processo termina imediatamente informando o caminho procurado e
apontando o arquivo de exemplo. Sem stack trace cru.

Repita sem a variável de ambiente:

```bash
unset HOLYRICS_TOKEN && npm start
```

**Esperado**: recusa nomeando `HOLYRICS_TOKEN`, **sem** ecoar valor algum.

---

## Cenário 3 — Sobe sem Holyrics e se recupera sozinho (US4, SC-005)

Com o Holyrics **fechado**:

```bash
npm start
```

**Esperado**: o serviço permanece em execução, registra a indisponibilidade uma
vez (não a cada tentativa) e vai espaçando as tentativas de 1s até 15s.

Agora abra o Holyrics, sem tocar no serviço.

**Esperado**: `holyrics_recuperado` no log e cor voltando a ser anunciada em até
30 segundos. Nenhum reinício manual.

Feche o Holyrics de novo com o serviço rodando: `holyrics_perdido`, processo
vivo. É a prova do Princípio IV.

---

## Cenário 4 — Calibração da região (FR-021, pendência aberta)

**Este cenário não valida — ele descobre.** Sem ele, `leitura.regiao` continua
sendo o chute que está no arquivo de exemplo.

Suba com verbosidade alta, que registra as 8 regiões a cada leitura:

```bash
LOG_LEVEL=debug npm start
```

Com uma apresentação de cor inequívoca no telão, compare as 8 cores registradas
com o que você vê. Escolha o índice que melhor representa o tema, grave em
`config/config.json` e **registre a descoberta** em
[contracts/holyrics-api.md](contracts/holyrics-api.md).

Repita com um tema de cor bem diferente para confirmar que o mesmo índice
continua servindo.

---

## Cenário 5 — Calibração do limiar (FR-021, pendência aberta)

Com o telão parado numa mesma música, deixe rodando 5 minutos em `debug`
(`LOG_LEVEL=debug npm start`).

Observe a variação de ΔE em repouso. O limiar precisa ficar **acima do ruído
observado** e abaixo da diferença entre dois temas distintos.

**Critério de aceitação (SC-003)**: com o valor escolhido, 5 minutos de telão
parado produzem no máximo 1 `cor_anunciada`.

Se não houver folga entre "ruído do vídeo de fundo" e "troca real de tema",
aumentar `cor.ciclosDeConfirmacao` é a saída antes de inflar o limiar — custa
latência, não fidelidade.

---

## Cenário 6 — Cor, item e slide no culto (US1, US3, SC-001, SC-010)

Com o serviço rodando e o Holyrics projetando:

| Ação no Holyrics | Esperado no log |
|---|---|
| Trocar para tema de cor distinta | `cor_anunciada` em até 3s (SC-002) |
| Avançar de estrofe | `slide_mudou`, **sem** `item_trocado` |
| Voltar uma estrofe | `slide_mudou` |
| Trocar de música | `item_trocado`, **sem** `slide_mudou` (FR-010c) |
| Trocar para música de cor parecida | `item_trocado` **sem** `cor_anunciada` (FR-012a) |
| Encerrar a apresentação | `apresentacao_encerrada` |
| Iniciar outra apresentação | `apresentacao_iniciada` + `cor_anunciada` com `motivo: primeira_leitura` |

**SC-010**: conduza uma música do início ao fim contando os avanços. O número de
`slide_mudou` deve bater exatamente — sem eventos extras na entrada nem na saída.

**SC-001**: repita a troca de tema com 10 temas de cor inequívoca. A cor anunciada
deve ser reconhecível como correta nas 10.

---

## Cenário 7 — Log sobrevive ao culto (SC-004, SC-007, SC-008, SC-009)

Depois de uma sessão longa, com o serviço já encerrado:

```bash
grep -c "cor_anunciada" logs/integrador.log
grep -i "token" logs/integrador.log
ls -la logs/
```

**Esperado**:

- A sequência de eventos é reconstruível com o processo morto (SC-008).
- A busca por `token` não devolve credencial alguma (SC-007).
- Os arquivos rotacionados respeitam o teto de tamanho e a quantidade mantida
  (SC-009).

---

## O que este quickstart não cobre

Nada de DMX, Freestyler ou fixture — não é escopo desta feature. Quando a feature
de saída existir, ela se inscreve nos eventos descritos em
[contracts/events.md](contracts/events.md) e ganha seu próprio quickstart.
