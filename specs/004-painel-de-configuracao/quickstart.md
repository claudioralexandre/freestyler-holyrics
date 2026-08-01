# Quickstart: Painel de configuração

**Feature**: 004 | **Date**: 2026-07-31 | **Plan**: [plan.md](plan.md)

Como verificar que a feature funciona. Dividido pelo que **precisa** do PC do
culto e pelo que não precisa — a divisão importa porque o projeto inteiro é
desenvolvido longe daquela máquina.

---

## Pré-requisitos

```bash
npm install
```

Configuração e token, como nas features anteriores:

```bash
export HOLYRICS_TOKEN=…
export CONFIG_PATH=./config/config.json
```

## Parte 1 — Sem Holyrics, sem Freestyler, sem navegador

Tudo que é núcleo. Se algo aqui falha, não adianta abrir a página.

```bash
npm test
```

```bash
npm run typecheck
```

O que os testes provam, e que requisito cada grupo cobre:

| Arquivo | Prova | Requisitos |
|---|---|---|
| `tests/unit/recarga.test.ts` | cada campo produz o efeito dele **e nenhum outro**; campo igual produz zero efeitos; `leitura.regiao` é o único que zera o estado de cor | FR-018, FR-019, FR-021a |
| `tests/unit/mesclagem.test.ts` | chave desconhecida sobrevive à gravação; `coresPorTag` substitui em vez de fundir | FR-025 |
| `tests/unit/state.test.ts` | cor extraída, origem e tag acompanham a cor **que está valendo**, não a leitura do ciclo | FR-005, FR-008 |
| `tests/unit/runtime.test.ts` | o snapshot compõe Freestyler e grupo; `null` distingue "sem saída DMX" de "fora do ar" | FR-005, FR-009 |
| `tests/unit/config.test.ts` | bloco `painel` ausente liga a página em `127.0.0.1`; `habilitado: false` desliga | FR-003a, FR-004 |

**Verificação estrutural que vale mais que um teste** — a 003 estabeleceu e esta
feature precisa preservar:

```bash
grep -rn "adapters\|service" src/core/
```

Não deve devolver nada. `core/` não importa de `adapters/` nem de `service/`, e é
essa regra que permite testar a recarga inteira sem abrir um socket.

```bash
git diff --stat main -- src/core/stability.ts
```

Deve devolver vazio. `stability.ts` intocado é a garantia estrutural de que a cor
mapeada não pula nenhuma barreira anti-flicker.

## Parte 2 — Serviço no ar, sem Holyrics

Prova a página e a recarga a quente sem depender de apresentação nenhuma.

```bash
npm run dev
```

Espere no log a linha `painel disponível` com o endereço. Abra
`http://127.0.0.1:3333`.

| # | O que fazer | O que tem que acontecer | Requisito |
|---|---|---|---|
| 1 | Abrir a página com o Holyrics fechado | A página sobe e mostra Holyrics indisponível. Não fica em branco nem em erro | FR-005, Princípio IV |
| 2 | Mudar `cor.limiarDeltaE` e salvar | Aceita sem reinício. O log nomeia **só** esse campo. Nenhuma linha de reconexão aparece | FR-017, FR-019, FR-022, SC-002, SC-007 |
| 3 | Salvar de novo o **mesmo** valor | Aceita e não produz efeito nenhum — nenhuma reconexão, nenhuma reresolução | FR-019 |
| 4 | Digitar `700` num componente de cor e salvar | Recusa nomeando o campo. O arquivo **não muda** (confira o mtime). O serviço segue rodando | FR-012, FR-013, US3 |
| 5 | Conferir a mensagem do passo 4 | Traz o caminho do campo e o problema, **não** o valor digitado | FR-016 |
| 6 | Editar o arquivo à mão, com a página aberta, e recarregar a página | Mostra o valor do disco **e** avisa que ele ainda não está valendo | FR-023a |
| 7 | Sem recarregar, mandar salvar depois de editar o arquivo à mão | Avisa que o arquivo mudou e oferece duas saídas: sobrescrever ou descartar e recarregar. Não sobrescreve antes da escolha | FR-026, FR-026a |
| 8 | Procurar o token em qualquer tela e em qualquer resposta | Não aparece em lugar nenhum | FR-015, SC-008 |
| 9 | Mudar a porta do painel pela própria página | Avisa antes de aplicar; o serviço passa a servir na porta nova; a aba antiga cai e o operador vai para o endereço novo | FR-018a |
| 10 | Mudar a porta do painel para uma já ocupada | Recusa a alteração; a página **continua** no endereço antigo | FR-018a, FR-004a |
| 11 | Subir com a porta do painel já ocupada por outro programa | O serviço sobe e opera; o motivo vai para o log; a luz segue sendo comandada | FR-004a |
| 12 | Subir com `painel.host: "0.0.0.0"` | Aviso na subida dizendo em que endereço está exposto, encontrável sem filtro | FR-003b, SC-010 |
| 13 | `LOG_LEVEL=debug npm run dev`, depois mudar o nível pela página | Grava, e a página mostra que o ambiente está sobrepondo o campo — sem prometer efeito que não haverá | FR-016a |
| 14 | `kill -9` durante uma gravação, depois subir de novo | O serviço sobe. O arquivo é o antigo inteiro ou o novo inteiro, nunca um meio-termo | FR-024, SC-006 |
| 15 | Instalar do zero, sem tocar no arquivo | A página responde em `127.0.0.1` e **não** responde de outra máquina da rede | FR-003a, SC-009 |
| 16 | Declarar `painel.host: "0.0.0.0"` e subir | Aí sim a página **responde** de outra máquina da LAN, sem pedir senha | FR-003 |
| 17 | Salvar uma alteração pela página, encerrar o serviço e subir de novo | Sobe aceitando o arquivo que a página gravou, sem nenhum erro de configuração | **SC-005**, FR-011 |

Os passos 15 e 16 são a mesma verificação em dois sentidos, e os dois precisam
passar. De outra máquina da LAN:

```bash
curl --max-time 3 http://IP-DA-MAQUINA:3333/api/estado
```

No passo 15 tem que falhar por conexão recusada — se responder, a FR-003a está
quebrada e o risco aceito da spec virou outro risco. No passo 16 tem que
responder: é a FR-003, e sem ela a configuração de rede existe sem funcionar.

**O passo 17 é o único que fecha o ciclo inteiro.** A FR-011 promete que a página
usa a mesma validação do arquivo; a mesclagem da FR-025 preserva chaves que o
esquema não conhece. Só um reinício de verdade prova que as duas coisas convivem —
que a página nunca produz arquivo que o serviço recuse.

## Parte 3 — Com Holyrics, sem Freestyler

Precisa do Holyrics rodando; não precisa de mesa nem de fixture.

| # | O que fazer | O que tem que acontecer | Requisito |
|---|---|---|---|
| 18 | Pôr um tema em exibição | A página mostra nome do tema, tags, cor extraída e cor efetiva, com a origem de cada uma — **sem abrir o log** | FR-005, SC-004, US1-1 |
| 19 | Criar um mapeamento clicando numa tag do tema | A tag entra **sem redigitar** | FR-006 |
| 20 | Salvar esse mapeamento | A cor efetiva passa a ser a mapeada, sem reinício, e a página distingue extraída de efetiva nomeando a tag | FR-008, FR-017, US1-2 |
| 21 | Remover o mapeamento e salvar | A extraída volta a valer no ciclo seguinte | US1-3 |
| 22 | Reordenar dois mapeamentos que casam com o mesmo tema | A nova ordem decide a precedência | FR-014 |
| 23 | Trocar o item no Holyrics com a página aberta | A tela acompanha sem recarregar, dentro do dobro do intervalo de leitura | FR-007, US1-5 |
| 24 | Pôr em exibição um tema **sem** tag | A página diz que não há tag a mapear, em vez de mostrar campo vazio | Edge case |
| 25 | Mudar `leitura.regiao` pela página | A cor seguinte é adotada e anunciada de imediato, como num arranque | **FR-021a** |

O passo 25 é o único da lista que verifica uma decisão da clarificação de hoje.
Se ele passar mostrando a cor nova só depois de N ciclos de confirmação, a FR-021a
não foi implementada — foi implementada a FR-021 sozinha.

## Parte 4 — Culto de verdade

Só no PC do culto, com Holyrics e Freestyler no ar e a mesa ligada. É a Phase de
verificação, irredutível — não tem como ser feita daqui.

| # | O que verificar | Requisito |
|---|---|---|
| 26 | O ciclo inteiro da US1 em menos de 30 s: ver a tag, mapear, salvar, ver o palco mudar | SC-001 |
| 27 | Renomear o grupo no Freestyler e ver a página apontar o grupo não resolvido, listando os que existem | FR-009 |
| 28 | Mudar o endereço do Freestyler pela página: conexão antiga encerrada, nova estabelecida, transição no log | US2-2 |
| 29 | Uma recarga aceita **durante** um envio ao Freestyler não corta o envio | FR-020 |
| 30 | `rename` atômico sobre arquivo existente no Windows, e o `EPERM` de antivírus | [research.md §8](research.md#8-o-que-esta-feature-não-pode-verificar-daqui) |
| 31 | Troca de destino de log a quente, com o transporte em worker do `pino` | [research.md §8](research.md#8-o-que-esta-feature-não-pode-verificar-daqui) |

Os passos 30 e 31 são as duas suposições de plataforma que entram no código
marcadas como não verificadas (Princípio I). Enquanto não forem exercitadas
naquela máquina, a feature tem dívida — declarada, como a 002 tem a dela.

---

## Resultados — sessão de 2026-07-31 (Linux, sem Holyrics e sem Freestyler)

**Parte 1 — passou.** 362 testes, `tsc --noEmit` limpo. `src/core/` em **100%**
de statements, branches, funções e linhas; `src/service/runtime.ts` idem.
`grep -rE "^\s*import .*(adapters|service)" src/core/` não devolve nada, e
`git diff main -- src/core/stability.ts` é vazio.

**Parte 2 — verificada por HTTP, não pelo navegador.** O serviço subiu com
`CONFIG_PATH` apontando para uma cópia, e as rotas foram exercitadas com `curl` e
`urllib`. O que passou:

| Cenário | Resultado |
|---|---|
| 2, 3 (FR-019, SC-007) | `cor.limiarDeltaE` → `["parametros_do_nucleo"]` e **nenhuma** linha de reconexão. Submeter o mesmo valor → `camposAlterados: []`, zero efeitos |
| 4, 5 (FR-012, FR-016) | `leitura.regiao: 99` → **422** com `leitura.regiao: Too big: expected number to be <=7`. O valor recebido **não** aparece. Arquivo intocado |
| 7 (FR-026, FR-026a) | `hashBase` errado → **409**; com `forcar: true` → **200** |
| 8 (FR-015, SC-008) | Nenhuma ocorrência de "token" em nenhuma resposta |
| 11 (FR-004a) | Segunda instância com a porta ocupada: subiu, registrou `painel não pôde subir; o serviço segue operando sem ele`, e seguiu lendo |
| 12 (FR-003b, SC-010) | `PAINEL EXPOSTO NA REDE em http://0.0.0.0:3333 — qualquer máquina que alcance esta aqui pode editar a configuração, sem senha` |
| 15 (FR-003a, SC-009) | De `192.168.1.27`, com o padrão `127.0.0.1`: **conexão recusada** |
| 16 (FR-003) | Com `painel.host: "0.0.0.0"`, a mesma URL: **200** |
| 17 (**SC-005**) | Salvou pela API, encerrou, subiu de novo: aceitou o arquivo, com `regiao: 3` e `limiarDeltaE: 7` — os valores que a página gravou |
| FR-023a | Editado à mão com o serviço no ar: a configuração em execução **não** mudou (7, com 99 no disco) e `discoDivergente` virou `true` |
| FR-025 | `_marca-desconhecida` e `holyrics._anotacao` sobreviveram a sete gravações |
| FR-018, FR-022 | Um campo → um efeito, sempre. `leitura.regiao` → `["parametros_do_nucleo","zerar_estado_de_cor"]`, e **só** ele (FR-021a) |
| Rotas | `/` → 200 `text/html`; caminho inexistente → 404; `POST /api/config` → 405; corpo não-JSON → 422; SSE entrega o retrato na conexão |

**O que a verificação achou, e que a spec não previa** — três defeitos reais,
todos corrigidos e registrados em `CLAUDE.md`:

1. **O diff comparava JSON cru contra JSON mesclado.** O esquema materializa
   padrões, então o bloco `painel` — ausente no arquivo — aparecia como campo
   novo na primeira gravação, disparando um `re_servir_painel` que ninguém
   pediu. Passou a comparar as configurações **validadas**.
2. **`re_servir_painel` colidia consigo mesmo.** Ele abria o endereço novo antes
   de fechar o antigo; quando o endereço não mudava, isso era `EADDRINUSE` e a
   submissão inteira era recusada. Agora endereço igual não rebinda.
3. **Desfazer uma recarga recusada reserializava o arquivo.** O espaçamento
   diferente mudava o hash, e a submissão seguinte batia num conflito fantasma.
   Passou a reescrever o conteúdo exato de antes.

**Pendente, e por quê:**

- **Cenários 1, 6, 9, 10, 13, 14 e a Parte 3 inteira** — exigem navegador, ou
  Holyrics no ar. O código está implementado; o que falta é exercitá-lo pela
  tela, que é onde a US1 acontece de verdade.
- **Parte 4** — exige o PC do culto. As duas suposições de plataforma seguem
  marcadas no código (`config-escrita.ts` e `logger.ts`), como manda o
  Princípio I.
