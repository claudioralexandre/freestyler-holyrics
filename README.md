# freestyler-holyrics

Projeto **build to learn** que usa o [Spec Kit](https://github.com/github/spec-kit)
para integrar duas ferramentas gratuitas: o **Holyrics** (projeção) e o
**Freestyler** (iluminação DMX). A ideia é a luz acompanhar a cor do que está no
telão — se o tema da música é azul, as fixtures marcadas como seguidoras ficam
azuis.

## Estado atual

Três features. As integrações estão **verificadas contra as ferramentas reais** —
Holyrics 2.29.1 e FreeStyler 4.1.7, com hardware.

**001 — leitura de cor do Holyrics.** Le a cor da apresentacao uma vez por
segundo, filtra por limiar perceptual e confirmacao por permanencia, acompanha
item, slide e tema, e sobrevive ao Holyrics fechado.

**002 — saida DMX para o Freestyler.** Consome os eventos da 001 e aplica a cor
nas fixtures de um grupo do Freestyler. A configuracao declara o **nome do
grupo**, nunca endereco DMX nem offset de canal: o Freestyler ja sabe o patch e
responde quando perguntado.

**003 — override de cor por tag do tema.** Quando a cor calculada sai errada, o
operador marca o tema com uma tag no Holyrics e declara a cor no arquivo. A partir
dai aquele tema, e qualquer outro marcado igual, acende a cor escolhida.

Falta a verificacao final com apresentacao no ar por um culto inteiro. Na 003
falta tambem confirmar **como uma tag do Holyrics chega de verdade**: nenhum tema
com tag foi observado nesta instalacao, entao o formato exato do conteudo segue
sendo suposicao marcada no codigo.

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
[contracts/config.md](specs/001-leitura-cor-holyrics/contracts/config.md) e, para
a saída DMX, em
[contracts/config.md da 002](specs/002-saida-dmx-freestyler/contracts/config.md).

O arquivo real fica fora do git; só o `config.example.json` é versionado.

### O bloco `freestyler`

```json
"freestyler": {
  "grupo": "03: Par Led",
  "corDeRepouso": { "r": 0, "g": 0, "b": 0 },
  "heartbeatTimeoutMs": 6000,
  "consultaTimeoutMs": 2000
}
```

**Você declara o nome do grupo, nunca endereço DMX nem offset de canal.** O
Freestyler já sabe o patch e responde quando perguntado; repetir isso no arquivo
criaria uma segunda fonte de verdade para divergir da primeira. O nome tem que
ser o que aparece na mesa, com o prefixo numérico: a comparação ignora
maiúsculas e espaços nas pontas, mas **não** ignora acento.

**Para desligar a saída, remova o bloco inteiro** — é a única forma. Bloco
presente sem `grupo` é recusado na subida, de propósito: com duas maneiras de
dizer "desligado", quem desligou por opção ficaria indistinguível de quem
esqueceu de preencher o nome, e o sintoma dos dois é o mesmo silêncio.

`consultaTimeoutMs` vale no máximo **metade** de `heartbeatTimeoutMs`. A consulta
precisa desistir antes de a mesa ser declarada morta; invertido, o log diria
"Freestyler perdido" antes de "consulta sem resposta", que é a ordem errada para
quem está diagnosticando.

### A seção `coresPorTag`

Serve para quando a cor extraída sai esquisita. O color map do Holyrics é uma
**média** amostrada do tema — tema com cores opostas vira cinza, tema claro vira
lavado — e até agora não havia como discordar do resultado sem editar o tema
dentro do Holyrics, mexendo no que a congregação vê para consertar o que ela não
vê.

Marque o tema com uma tag no Holyrics, declare a cor aqui, e aquele tema passa a
acender a cor que você escolheu:

```json
"coresPorTag": [
  { "tag": "azul-escuro", "cor": { "r": 0, "g": 20, "b": 120 } },
  { "tag": "azul", "cor": { "r": 0, "g": 40, "b": 200 } }
]
```

Configurar um override exige de você **uma tag que já usa no Holyrics e três
números de 0 a 255**. Nada mais. Remover a seção inteira desliga a feature, e é a
única forma de desligar.

**É array, e isso não é estilo.** A ordem declarada é a regra de desempate, e
objeto JSON não preserva ordem: uma chave como `2024` salta para a frente das
demais e ainda se reordena entre as outras numéricas. Com array, a ordem é a
ordem, para qualquer tag que você escreva.

| Aspecto | Comportamento |
|---|---|
| Empate | Vence a **primeira declarada**, de cima para baixo. A ordem das tags no Holyrics não influencia — declare o específico antes do genérico |
| Caixa e espaço nas pontas | Ignorados |
| Acento | **Conta**: `ceu` não casa com `céu`. Mas as duas grafias Unicode do mesmo acento casam entre si |
| Tags que casam entre si | Recusadas na subida, com as duas nomeadas. Uma venceria sempre e a outra nunca |
| Preto | Cor válida — apaga as seguidoras naquele tema |

O override é **do tema**: enquanto o tema permanecer, a cor declarada permanece,
qualquer que seja a música ou o slide. Ele também vale quando a leitura de cor
falha — a cor declarada não depende da extração. O que ele **não** faz é acender
luz sem apresentação no ar: aí o repouso continua mandando.

A cor mapeada atravessa as mesmas barreiras que qualquer outra — limiar e
confirmação por permanência. Ela não pula a fila, e é por isso que o palco leva os
mesmos ~2 segundos de sempre para mudar.

## O que aparece no log

O log é JSON (`pino`), em `./logs/integrador.log`. Em nível normal, o que a saída
DMX escreve:

| Linha | Quando | O que confirma |
|---|---|---|
| `inventário do Freestyler` | Subida e cada reconexão | Versão, grupos e fixtures com endereço. É como conferir a configuração sem abrir a mesa |
| `grupo seguidor resolvido` | Primeira aplicação após conectar | O nome configurado casou, e em qual posição |
| `seleção efetivada` | A cada seleção de grupo | **Quantas e quais fixtures** a seleção atingiu |
| `cor escrita` / `cor de repouso escrita` | A cada mudança de cor | A luz foi comandada. Sem esta linha, um culto inteiro rodaria sem sinal nenhum |
| `aguardando a primeira cor anunciada` | Uma vez, sem apresentação | O silêncio é deliberado, não defeito |

Os avisos que valem procurar quando a luz não acompanha:

| Aviso | Significa |
|---|---|
| `grupo configurado não existe no Freestyler` | Nome errado. A linha traz os nomes válidos |
| `mais de um grupo casa com o nome configurado` | Nome ambíguo. A linha traz os conflitantes |
| `grupo seguidor existe mas está vazio` | O grupo não tem fixture nenhuma. Mesmo sintoma de defeito, causa diferente |
| `seleção de grupo não confirmada` | A mesa não assumiu a seleção; nenhuma cor é escrita nesse ciclo |
| `falha ao escrever a cor` | Traz a divergência entre pretendida e escrita, e o reenvio vem sozinho |
| `Freestyler não responde (sem batimento)` | Mesa travada com o socket aberto — a escrita "funcionaria" para o vazio |

Com `coresPorTag` declarada, mais quatro linhas:

| Linha | Quando | O que confirma |
|---|---|---|
| `override de cor por tag ativo` | Subida | Quantos mapeamentos foram lidos e quais tags cobrem. Um override esquecido no arquivo aparece aqui |
| `cor anunciada: #… — da tag "x"` | A cada cor vinda de mapeamento | Qual tag respondeu, e qual cor a extração havia calculado |
| `tema traz tags, nenhuma mapeada` | Troca de tema | **É o diagnóstico de tag digitada diferente** nos dois lados. Sem esta linha, o sintoma é igual ao de override nenhum |
| `mais de uma tag mapeada; venceu "x"` | Empate | Qual venceu e quais foram preteridas, para você mover a linha certa no arquivo |

Tema sem tag alguma **não** gera linha: é o estado normal de quem não usa a
feature, e registrá-lo encheria o log de ruído em todo culto.

Em `debug` entra ainda o detalhe por slot de cada envio (`detalhe do envio de
cor`) e o ciclo de leitura do Holyrics.

**Sobre o vocabulário**: o log diz cor **escrita**, nunca "aplicada" ou
"entregue". O protocolo do Freestyler não confirma valor de cor — só a seleção
de grupo é confirmável — e o texto não afirma o que não é observável.

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
- [specs/002-saida-dmx-freestyler/](specs/002-saida-dmx-freestyler/) — idem, e o
  [contrato do Freestyler](specs/002-saida-dmx-freestyler/contracts/freestyler.md)
  com o protocolo verificado contra a ferramenta real
