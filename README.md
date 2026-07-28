# freestyler-holyrics

Projeto **build to learn** que usa o [Spec Kit](https://github.com/github/spec-kit)
para integrar duas ferramentas gratuitas: o **Holyrics** (projeção) e o
**Freestyler** (iluminação DMX). A ideia é a luz acompanhar a cor do que está no
telão — se o tema da música é azul, as fixtures marcadas como seguidoras ficam
azuis.

## Estado atual

A primeira feature, **leitura de cor do Holyrics**, está implementada. Ela cobre
só o lado de entrada:

- lê a cor predominante da apresentação em exibição, uma vez por segundo;
- só anuncia mudança de cor quando ela ultrapassa um limiar perceptual (ΔE) **e**
  se sustenta por leituras seguidas — o que evita as luzes piscarem junto com o
  vídeo de fundo;
- acompanha item, slide e tema, emitindo um evento para cada mudança;
- sobrevive ao Holyrics fechado, em qualquer momento, e se recupera sozinho.

**Ainda não envia nada ao Freestyler.** Os eventos ficam disponíveis por
assinatura em memória; a feature de saída (DMX) é a próxima e vai consumi-los.

> ⚠️ O contrato do Holyrics ainda **não foi verificado** contra a ferramenta real
> — veio da documentação pública. Ver a seção *Antes de usar num culto*.

## Requisitos

- Node.js 22 ou superior
- Holyrics com o **API Server** ativado
- Windows para o cenário real (o Freestyler é Windows-only), embora esta feature
  rode em qualquer plataforma

## Instalação

No PC do culto (Windows, PowerShell):

```powershell
.\scripts\install.ps1
```

Em desenvolvimento (Linux, macOS):

```bash
./scripts/install.sh
```

O script confere o Node.js (instalando via `winget` no Windows, se faltar),
baixa as dependências, compila, cria `config/config.json` e `.env` a partir dos
exemplos e roda a suíte de testes.

Depois, duas coisas manuais:

1. Colocar o token do Holyrics em `.env` (`HOLYRICS_TOKEN=`)
2. Conferir a porta do API Server em `config/config.json`

## Uso

```powershell
.\scripts\start.ps1        # sobe em segundo plano
.\scripts\start.ps1 -Debug # com detalhe por leitura, para calibrar
.\scripts\status.ps1       # está rodando? últimos eventos
.\scripts\stop.ps1         # encerra
```

Os equivalentes em shell são `./scripts/start.sh` (com `--debug` e
`--foreground`), `./scripts/status.sh` e `./scripts/stop.sh`.

O `.env` é conveniência dos scripts: eles carregam as variáveis no ambiente do
processo. O integrador em si **nunca lê o `.env`** — ele só conhece variáveis de
ambiente.

Sem os scripts, direto:

```bash
npm run build && HOLYRICS_TOKEN=seu-token node dist/main.js
```

Testes:

```bash
npm test
```

A suíte roda inteira **sem Holyrics** — toda a lógica de decisão é pura, o que
permite desenvolver longe do PC do culto.

## Variáveis de ambiente

| Variável | Obrigatória | Efeito |
|---|---|---|
| `HOLYRICS_TOKEN` | sim | Credencial do API Server. Nunca é registrada em log |
| `CONFIG_PATH` | não | Caminho alternativo do arquivo de configuração |
| `LOG_LEVEL` | não | Sobrepõe `log.nivel` (`debug`, `info`, `warn`, `error`) |

## Configuração

Tudo em `config/config.json` — host, porta, intervalo de leitura, região de cor,
limiar, confirmação, reconexão e log. Os campos e suas regras estão em
[contracts/config.md](specs/001-leitura-cor-holyrics/contracts/config.md).

O arquivo real fica fora do git; só o `config.example.json` é versionado.

## Antes de usar num culto

Três valores no `config.example.json` são **chute declarado** e precisam ser
calibrados contra o Holyrics real:

| Campo | Por que ainda não tem valor bom |
|---|---|
| `leitura.regiao` | O color map devolve 8 posições e a documentação não diz qual é qual parte da tela |
| `cor.limiarDeltaE` | Depende de quanto o fundo em vídeo oscila nesta instalação |
| `holyrics.requestTimeoutMs` | Depende da latência medida |

O procedimento está nos cenários 4 e 5 do
[quickstart](specs/001-leitura-cor-holyrics/quickstart.md). E o contrato da API,
com o que falta observar, em
[contracts/holyrics-api.md](specs/001-leitura-cor-holyrics/contracts/holyrics-api.md).

## Estrutura

```
src/core/      # Puro: decisão de cor, limiar, eventos. Sem I/O, sem relógio
src/adapters/  # Finos: Holyrics, configuração, log
src/service/   # Ciclo, disponibilidade, reconexão
tests/unit/    # Toda a lógica pura
scripts/       # Instalar, subir, parar, consultar estado
specs/         # Spec Kit: spec, plano, contratos, tarefas
```

`core/` não importa nada de `adapters/` nem de `service/`. É essa regra que
permite testar a lógica de cor sem nada ligado.

## Documentação

- [CLAUDE.md](CLAUDE.md) — visão geral do domínio e das duas integrações
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — princípios
  que governam o desenvolvimento
- [specs/001-leitura-cor-holyrics/](specs/001-leitura-cor-holyrics/) — spec,
  plano, contratos, tarefas
