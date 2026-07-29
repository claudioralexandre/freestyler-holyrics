# freestyler-holyrics

Projeto **build to learn** que usa o [Spec Kit](https://github.com/github/spec-kit)
para integrar duas ferramentas gratuitas: o **Holyrics** (projeção) e o
**Freestyler** (iluminação DMX). A ideia é a luz acompanhar a cor do que está no
telão — se o tema da música é azul, as fixtures marcadas como seguidoras ficam
azuis.

## Estado atual

Duas features, ambas com as integrações **verificadas contra as ferramentas
reais** — Holyrics 2.29.1 e FreeStyler 4.1.7, com hardware.

**001 — leitura de cor do Holyrics.** Le a cor da apresentacao uma vez por
segundo, filtra por limiar perceptual e confirmacao por permanencia, acompanha
item, slide e tema, e sobrevive ao Holyrics fechado.

**002 — saida DMX para o Freestyler.** Consome os eventos da 001 e aplica a cor
nas fixtures de um grupo do Freestyler. A configuracao declara o **nome do
grupo**, nunca endereco DMX nem offset de canal: o Freestyler ja sabe o patch e
responde quando perguntado.

Falta a verificacao final com apresentacao no ar por um culto inteiro.

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

Os tres valores da 001 foram **calibrados** em 2026-07-29 contra o Holyrics
real: regiao 0, limiar de dE 2, tempo limite 800ms. Detalhes e o metodo em
[contracts/holyrics-api.md](specs/001-leitura-cor-holyrics/contracts/holyrics-api.md).

O que resta conferir na sua instalacao:

| Item | Por que |
|---|---|
| `freestyler.grupo` | Tem que ser o nome exato do grupo no Freestyler. Se errar, o log lista os nomes validos e nenhuma luz e comandada |
| `freestyler.corDeRepouso` | O neutro depende da instalacao. Preto apaga as seguidoras |

**Efeito colateral que vale saber**: para colorir, o integrador precisa
selecionar o grupo na mesa. Se voce estiver operando o Freestyler a mao durante
o culto, vera a selecao mudar sozinha a cada troca de cor. Nao ha como evitar
por esse protocolo, e a selecao anterior **nao** e restaurada de propria
iniciativa.

**O integrador nao comanda nada ate a primeira cor anunciada.** Se o servico
subir sem apresentacao no ar, as fixtures ficam como estao, e o log diz que se
aguarda. E deliberado: a subida do servico e quando voce esta configurando a
mesa, e nao seria bom o integrador entrar puxando sua selecao.

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
