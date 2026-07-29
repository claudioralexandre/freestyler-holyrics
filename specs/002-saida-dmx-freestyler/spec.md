# Feature Specification: Saída DMX para o Freestyler

**Feature Branch**: `002-saida-dmx-freestyler`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "Saída DMX: consumir os eventos da feature 001 e aplicar a cor anunciada nas fixtures RGB seguidoras via Freestyler"

## Contexto

A feature 001 já produz um sinal de cor estável: lê o Holyrics uma vez por
segundo, filtra o ruído por limiar perceptual e confirmação por permanência, e
anuncia a cor por assinatura em memória. Hoje esse anúncio não vai a lugar
nenhum além do log.

Esta feature fecha o ciclo. Ela é o **consumidor** do contrato descrito em
[001/contracts/events.md](../001-leitura-cor-holyrics/contracts/events.md) e o
**produtor** dos comandos que chegam ao Freestyler. Quando ela estiver pronta, o
comportamento-alvo do projeto existe pela primeira vez: música de tema azul no
telão, fixtures seguidoras azuis no palco.

## Clarifications

### Session 2026-07-28

- Q: Quando não há apresentação em exibição, o que acontece com as fixtures
  seguidoras? → A: Vão para uma cor de repouso declarada na configuração
  (FR-026). Separa "sem apresentação" de "apresentação preta", e deixa o neutro
  na mão de quem conhece a instalação.
- Q: O avanço de estrofe deve produzir alguma reação nas fixtures? → A: Nenhuma
  nesta feature (FR-006). O evento continua sendo emitido pela 001 e registrado
  em log; a porta aberta na 001 permanece aberta, sem consumidor ainda.
- Q: Ao trocar de cor, as fixtures pulam para o novo valor ou transitam? → A:
  A transição é delegada ao Freestyler, se ele tiver fade próprio; o integrador
  nunca implementa transição temporizada. Como esse comportamento não foi
  observado, é suposição não verificada com queda para salto instantâneo
  (FR-013, FR-013a).
- ~~Q: Quando o serviço sobe e ainda não recebeu nenhum evento, o que acontece
  com as fixtures seguidoras? → A: A cor de repouso é aplicada imediatamente na
  subida.~~ **Revertida em 2026-07-29** — ver a sessão seguinte. A premissa de
  que comandar era invisível não sobreviveu à verificação do protocolo.
- Q: Ao encerrar o serviço, o integrador comanda algo antes de sair? → A: Não
  (FR-028). Encerrar significa parar de comandar; o operador que para o serviço
  quer as luzes na mão dele, inclusive quando o motivo é o integrador estar se
  comportando mal.
- Q: A cor de repouso é única ou declarada por fixture? → A: Única, no nível da
  configuração (FR-026d). Todas as seguidoras exibem a mesma cor o tempo todo por
  definição; repouso por fixture seria o único ponto de divergência, e o segundo
  caso real ainda não apareceu.
- Q: Se um envio fatiado falhar em um dos lotes, o que o sistema considera
  aplicado? → A: Tudo-ou-nada (FR-029). O estado entregue não avança, e o envio
  completo da cor pretendida é reagendado — inclusive sem queda de conexão. Fica
  nomeada a distinção entre **cor pretendida** e **último conjunto entregue**.
- ~~Q: Como o operador descobre qual lâmpada física corresponde a cada fixture
  da config? → A: Por um script de calibração separado, que acende sob comando
  uma fixture nomeada (FR-030).~~ **Superada em 2026-07-29**: a pergunta
  pressupunha que o Freestyler não sabia dizer. Ele sabe — responde nome e
  endereço de cada fixture.
- ~~Q: E se a calibração rodar com o serviço no ar? → A: A ferramenta recusa
  (FR-030c).~~ **Superada**: sem ferramenta de calibração, não há conflito. O
  raciocínio continua válido e vale a pena guardar — escrita por fora deixaria o
  serviço convicto de ter escrito a cor certa, e a supressão de envio redundante
  impediria a correção até a próxima mudança, sem nada no log.
- Q: Deve haver intervalo mínimo obrigatório entre envios ao Freestyler? → A:
  Não (FR-031). A taxa já está limitada pela leitura de 1s da 001, pela
  confirmação por permanência, pela serialização (FR-016) e pela supressão de
  redundância (FR-015). O limite próprio só se justifica se a verificação contra
  o Freestyler real mostrar perda de comando.

### Session 2026-07-29 — revisão após verificar o Freestyler

Não foram perguntas ao usuário: são decisões forçadas pela observação da
ferramenta real. O protocolo se mostrou bem mais capaz do que a biblioteca da
comunidade expõe, e requisitos escritos para contornar limitações inexistentes
perderam objeto. Detalhes em [contracts/freestyler.md](contracts/freestyler.md).

- **Configuração passa a declarar nome de grupo**, não endereço DMX e offsets
  (FR-008, FR-009). O Freestyler responde nomes e endereços das fixtures; pedir
  ao operador que redigite o patch num JSON é duplicar o que já existe, com
  risco de divergir.
- **Ferramenta de calibração removida** (era FR-030 a FR-030c). Existia para
  descobrir qual luminária está em qual endereço por tentativa e erro. A
  informação é consultável. O inventário vai para o log (FR-025a).
- **Fatiamento em lotes de ~100 removido** (FR-014). O limite pertence ao
  caminho por canal cru; pela via de grupo, o custo de uma aplicação de cor não
  cresce com o número de fixtures.
- **Confirmação de entrega passa a ser dois casos, não um** (FR-015b, FR-015c).
  Cor não é confirmável; seleção de grupo é, por leitura de volta.
- **Ausência de heartbeat vira perda de disponibilidade** (FR-021a a FR-021c).
  Socket TCP aberto não denuncia mesa travada.
- **Fade deixa de ser hipótese e passa a ser impossibilidade** (FR-013a). Não há
  comando para isso na tabela do fabricante.
- **`Group N` é toggle, e a seleção é exclusiva** (FR-012a, FR-012a-2). Enviar o
  comando "por garantia" apagaria a luz em toda aplicação par.

Perguntas de fato ao usuário, nesta sessão:

- Q: Depois de aplicar a cor, o integrador restaura a seleção de grupos que o
  operador tinha? → A: Não (FR-012c). Restaurar exige mais um toggle sobre um
  estado que pode ter mudado no intervalo, e cada toggle a mais é risco num
  protocolo sem confirmação de cor. Durante o culto a cor é do integrador.
- Q: Como o nome do grupo é comparado com o que vem do Freestyler? → A:
  Ignorando maiúsculas/minúsculas e espaços nas pontas (FR-009b). Acentos
  contam. O nome é digitado à mão; acerto de digitação não deveria ser
  requisito, mas tolerar demais esconderia colisão entre grupos.
- Q: O integrador continua procurando o grupo se ele não existir? → A: Sim,
  sempre que houver cor para aplicar e o grupo ainda não tiver sido resolvido
  (FR-011a). Cobre o caso real de configurar antes do culto e corrigir sem
  reiniciar, e não custa ciclo nenhum em regime normal.
- Q: Na subida, aplicar a cor de repouso imediatamente, sabendo que isso agora
  rouba a seleção de grupo da mesa? → A: **Não** (FR-027). **Reverte** a decisão
  da sessão de 28/07. O raciocínio de lá continua válido; o que caiu foi a
  premissa de que comandar era invisível. Aplicar cor exige selecionar o grupo,
  e a subida é quando o operador está configurando o Freestyler. O integrador
  passa a esperar a primeira cor real antes de tocar na mesa.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A luz assume a cor do telão (Priority: P1)

Durante o culto, a apresentação muda para uma música de fundo azul. Alguns
segundos depois, as fixtures do grupo que o operador declarou como seguidor
assumem esse azul. Ninguém tocou em nada. As demais fixtures — as que iluminam o
púlpito, as que estão em uma cena fixa — continuam exatamente como estavam.

**Why this priority**: é a feature. Sem isto, nada do projeto se manifesta no
mundo físico. Todo o resto desta spec é resiliência ou refinamento em volta deste
comportamento.

**Independent Test**: com o Freestyler aberto e um grupo declarado na config,
alimentar um evento `cor_anunciada` e observar o grupo assumir a cor. Sem
Holyrics: o evento pode ser injetado diretamente, porque o contrato da 001 é uma
assinatura em memória.

**Acceptance Scenarios**:

1. **Given** um grupo declarado como seguidor e fixtures fora dele, **When**
   chega `cor_anunciada` com uma cor, **Then** as fixtures do grupo assumem a
   cor e as demais não mudam de estado.
2. **Given** o grupo já na cor anunciada, **When** chega um novo `cor_anunciada`
   com a mesma cor, **Then** nenhum comando é enviado ao Freestyler.
3. **Given** o serviço acabou de subir e ainda não houve anúncio de cor,
   **When** o primeiro `cor_anunciada` chega com `motivo: primeira_leitura`,
   **Then** o grupo assume a cor da mesma forma que numa mudança confirmada.
4. **Given** o operador selecionou outro grupo manualmente na mesa, **When**
   chega `cor_anunciada`, **Then** o integrador seleciona o grupo seguidor antes
   de aplicar a cor, e a cor não vaza para o grupo que estava selecionado.

---

### User Story 2 - O Freestyler fechado não derruba o culto (Priority: P2)

O operador sobe o integrador antes de abrir o Freestyler, ou o Freestyler trava
no meio do culto. O integrador continua rodando, continua lendo o Holyrics,
continua registrando o que está acontecendo, e volta a comandar as luzes sozinho
assim que o Freestyler responde de novo — já na cor corrente, não na cor que
estava valendo quando a conexão caiu.

**Why this priority**: o Princípio IV da constitution não é negociável, e o
Freestyler é descrito como alvo frágil. Um integrador que morre porque o
Freestyler fechou é pior que nenhum integrador: some no meio do culto e ninguém
está olhando o terminal.

**Independent Test**: subir o serviço com o Freestyler fechado, confirmar que ele
opera e registra a ausência; abrir o Freestyler e confirmar que as luzes assumem
a cor corrente sem intervenção.

**Acceptance Scenarios**:

1. **Given** o Freestyler fechado, **When** o integrador sobe, **Then** o
   processo permanece vivo, registra a indisponibilidade uma vez, e segue
   consumindo eventos.
2. **Given** o Freestyler indisponível e uma cor anunciada nesse período,
   **When** o Freestyler volta, **Then** a cor **corrente** é aplicada — não a
   fila de cores que passaram durante a queda.
3. **Given** o Freestyler indisponível, **When** as tentativas de reconexão se
   sucedem, **Then** o intervalo entre elas cresce até um teto, e o log registra
   a transição de estado, não cada tentativa.

---

### User Story 3 - Sem apresentação, as luzes têm um estado definido (Priority: P3)

O culto acaba, ou o operador fecha a apresentação entre um bloco e outro. O
Holyrics passa a reportar que não há nada em exibição. As fixtures seguidoras
vão para a cor de repouso que o operador declarou na configuração — o neutro da
instalação dele, que pode ser um branco quente, um âmbar suave, ou preto se ele
preferir apagá-las. Nunca ficam presas na última cor por acidente.

**Why this priority**: é um estado real e frequente, mas o culto não quebra se
ele for tratado depois de US1 e US2. O que ele não pode é ser acidental.

**Independent Test**: alimentar `apresentacao_encerrada` e verificar que as
fixtures seguidoras vão para a cor de repouso configurada.

**Acceptance Scenarios**:

1. **Given** fixtures seguidoras acesas em uma cor, **When** chega
   `apresentacao_encerrada`, **Then** elas assumem a cor de repouso declarada na
   configuração.
2. **Given** as fixtures em repouso, **When** chega `apresentacao_iniciada`
   seguido do primeiro `cor_anunciada`, **Then** elas voltam a seguir a cor.
3. **Given** as fixtures seguindo uma cor, **When** chega `holyrics_perdido`,
   **Then** elas **mantêm** a cor corrente — perder a leitura não é o mesmo que
   a apresentação ter acabado.
4. **Given** a cor de repouso configurada como preto, **When** chega
   `apresentacao_encerrada`, **Then** as fixtures seguidoras apagam.
5. **Given** o serviço recém-iniciado e nenhuma apresentação no Holyrics,
   **When** ele termina de subir, **Then** nenhum comando é enviado, as fixtures
   ficam como o operador as deixou, e o log diz que se aguarda a primeira cor.
6. **Given** o serviço aguardando a primeira cor, **When** a primeira
   apresentação entra e a cor é anunciada, **Then** o grupo é selecionado e
   colorido — e só a partir daí o repouso passa a valer.
7. **Given** uma apresentação em exibição cuja cor extraída é preta, **When**
   ela é anunciada, **Then** ela é aplicada como cor normal — o sistema não a
   confunde com repouso nem a suprime.

---

### User Story 4 - O operador descobre por que não está funcionando (Priority: P4)

O operador escreve o nome do grupo na configuração e as luzes não seguem a cor.
Ele precisa descobrir sozinho se errou o nome, se o grupo foi renomeado, se o
Freestyler não está no ar, ou se a apresentação é que não tem cor — sem abrir o
código, sem parar o culto e sem mexer na mesa.

**Why this priority**: não muda o comportamento, mas é o que separa "não
funciona" de "está mal configurado". Sem isso, os dois têm o mesmo sintoma: luz
parada.

> **Reescrita em 2026-07-29.** Esta história era sobre calibrar endereços DMX,
> descobrindo por tentativa e erro qual luminária estava em qual canal. Isso
> deixou de ser necessário: o Freestyler responde nome e endereço de cada
> fixture. O que sobrou de real é o diagnóstico de configuração.

**Independent Test**: configurar um nome de grupo inexistente e conferir que o
log diz exatamente isso, listando os nomes válidos.

**Acceptance Scenarios**:

1. **Given** o nome de grupo configurado não existe no Freestyler, **When** o
   serviço sobe, **Then** o log nomeia o grupo procurado e lista os encontrados,
   e o serviço continua rodando sem comandar luz.
2. **Given** o serviço em operação normal, **When** ele sobe ou reconecta,
   **Then** o log registra a versão do Freestyler, os grupos disponíveis e qual
   foi resolvido como seguidor.
3. **Given** o log em nível detalhado, **When** uma cor é aplicada, **Then** o
   registro traz a cor de origem, o grupo selecionado e o valor de cada slot.
4. **Given** o grupo é renomeado no Freestyler durante o culto, **When** o
   integrador reconecta, **Then** ele detecta a ausência e registra, em vez de
   seguir comandando no vazio.

---

### Edge Cases

- **Cor anunciada durante a queda do Freestyler.** Não vira fila. Vale a cor
  corrente no momento em que a conexão volta (US2, cenário 2).
- **Nome de grupo inexistente ou renomeado.** Detectado na subida e a cada
  reconexão. O serviço segue rodando e registra o nome procurado com a lista dos
  existentes; não comanda luz até resolver (FR-010, FR-010a, FR-011).
- **Grupo existe mas está vazio.** Selecionar funciona, colorir não atinge
  ninguém. Não é erro do integrador — mas o log deve permitir notar, porque o
  sintoma é luz parada.
- **Operador selecionando outro grupo na mesa.** O integrador seleciona o seu
  antes de cada aplicação (FR-012a), então a cor não vaza. Em compensação, a
  seleção visível do operador muda sozinha (FR-012b).
- **Cor idêntica à última enviada.** Não gera tráfego. O Freestyler é um alvo
  frágil e o protocolo emula teclas.
- **`cor_anunciada` chegando enquanto o envio anterior ainda está em curso.** Os
  envios não se sobrepõem; a cor mais recente prevalece sobre uma intermediária
  que ainda não saiu.
- **Nenhum grupo declarado como seguidor.** É configuração legítima — o serviço
  sobe, consome eventos e não comanda nada.
- **Freestyler travado com o socket aberto.** Não é detectável por falha de
  escrita. A ausência de heartbeat é o que denuncia (FR-021a).
- **Evento `slide_mudou`.** Não produz efeito nesta feature, por decisão
  explícita (FR-006). Continua no log.
- **Apresentação cuja cor extraída é preta.** É cor legítima e vai para as
  fixtures. Não deve ser confundida com o repouso, que só vale quando não há
  apresentação alguma (FR-026c).
- **Fade.** Não existe caminho para ele na tabela de comandos do fabricante. O
  comportamento é salto instantâneo, por ausência de alternativa (FR-013a).

## Requirements *(mandatory)*

### Functional Requirements

#### Consumo de eventos

- **FR-001**: O sistema MUST se inscrever no contrato de eventos da feature 001 e
  reagir aos eventos entregues, sem alterar o comportamento de leitura já
  especificado ali.
- **FR-002**: O sistema MUST tratar `cor_anunciada` como o único gatilho de cor,
  independentemente do `motivo` (`primeira_leitura` ou `mudanca_confirmada`).
- **FR-003**: O sistema MUST NOT derivar cor de `tema_trocado` nem de
  `item_trocado`. A troca de item que muda a cor já produz `cor_anunciada`; a
  que não muda, deliberadamente não produz.
- **FR-004**: O sistema MUST reagir a `apresentacao_encerrada` levando as
  fixtures seguidoras ao estado de repouso.
- **FR-005**: O sistema MUST manter a cor corrente ao receber `holyrics_perdido`.
  Perda de leitura não é fim de apresentação.
- **FR-006**: O sistema MUST NOT produzir qualquer alteração nas fixtures em
  resposta a `slide_mudou`. O evento continua sendo emitido pela 001 e
  registrado em log; esta feature deliberadamente não o consome.
- **FR-007**: Uma exceção lançada ao processar um evento MUST ser registrada e
  descartada, sem interromper o consumo dos eventos seguintes.

#### Grupo seguidor e mapeamento

> **Revisado em 2026-07-29.** Esta seção foi reescrita depois que o protocolo do
> Freestyler foi verificado. O desenho original declarava endereço DMX inicial e
> offsets de R/G/B por fixture, porque a biblioteca da comunidade só expõe
> `canal @ valor`. A ferramenta oferece bem mais: consulta de nomes e endereços,
> seleção por grupo e coloração RGB do grupo selecionado. Ver
> [contracts/freestyler.md](contracts/freestyler.md).

- **FR-008**: A configuração MUST declarar **um grupo do Freestyler** como
  seguidor de cor, pelo nome que ele tem lá. Fixture fora desse grupo MUST NOT
  receber comando algum do integrador, em nenhuma circunstância.
- **FR-009**: O sistema MUST descobrir os grupos existentes consultando o
  próprio Freestyler, e MUST NOT exigir que o operador declare endereço DMX,
  offsets de canal ou qualquer detalhe de patch. Essa informação já existe na
  ferramenta e duplicá-la em arquivo é convite a divergência.
- **FR-009a**: O sistema MUST resolver o nome configurado para a posição do
  grupo na consulta, e MUST tratar essa posição como detalhe interno — a
  configuração fala em nome, nunca em número.
- **FR-009b**: A comparação de nomes MUST ignorar diferença de maiúsculas e
  minúsculas e espaços nas pontas. Acentos **contam**: `"Mov Chao"` não casa com
  `"01: Mov Chão"`.
  > O nome é digitado à mão a partir do que se lê na tela do Freestyler. Tolerar
  > caixa e espaço elimina os dois enganos mais comuns; tolerar acento
  > começaria a aproximar nomes distintos, e a mensagem de erro de FR-010 já
  > resolve o resto mostrando os nomes reais.
- **FR-009c**: Se mais de um grupo casar com o nome configurado sob a regra de
  FR-009b, o sistema MUST recusar operar sobre luz e registrar a ambiguidade com
  os nomes conflitantes. Escolher um deles em silêncio seria pior que não
  comandar.
- **FR-010**: Na inicialização, o sistema MUST verificar que o grupo configurado
  existe no Freestyler. Se não existir, MUST recusar operar sobre luz, registrar
  o nome procurado e **listar os grupos encontrados**, para que o erro se
  resolva sem consultar código nem documentação.
- **FR-010a**: A ausência do grupo MUST NOT derrubar o processo. O serviço
  continua consumindo eventos e registrando; apenas não comanda (Princípio IV).
- **FR-011**: O sistema MUST reverificar a existência do grupo a cada
  reconexão ao Freestyler. O operador pode ter renomeado ou removido o grupo
  enquanto a mesa esteve fora.
- **FR-011a**: Enquanto o grupo não estiver resolvido, o sistema MUST tentar
  resolvê-lo de novo a cada vez que houver cor para aplicar. Uma vez resolvido,
  MUST NOT repetir a busca até a próxima reconexão.
  > O caso real é configurar antes do culto: o operador sobe o serviço, vê no log
  > que errou o nome, corrige no Freestyler e espera que funcione sem reiniciar.
  > Amarrar a nova tentativa à existência de cor a aplicar evita tanto o
  > reinício obrigatório quanto uma consulta em laço durante o culto inteiro.
- **FR-011b**: A falha repetida de resolução MUST ser registrada apenas quando a
  condição mudar, não a cada tentativa — mesma regra que a 001 usa para falha
  parcial, e pelo mesmo motivo: um culto inteiro não pode virar a mesma linha
  repetida milhares de vezes.
- **FR-012**: O sistema MUST aplicar a cor anunciada aos três slots de mistura
  do grupo selecionado, sem correção de gama, curva ou calibração por fixture.
  **Verificado**: os slots que a tabela do fabricante chama de Cyan, Magenta e
  Yellow correspondem a vermelho, verde e azul em fixture aditiva.
- **FR-012a**: Cada aplicação de cor MUST ser precedida da **garantia** de que o
  grupo seguidor está selecionado: o sistema MUST ler o status dos grupos e só
  enviar o comando de seleção **se o grupo não estiver ativo**.
  > **Verificado em 2026-07-29, e é o motivo deste requisito existir nesta
  > forma.** O comando `Group N` é **toggle**, não seleção: enviado com o grupo
  > já ativo, ele **desliga**. A redação anterior — "selecionar antes de cada
  > aplicação" — faria a luz apagar em toda aplicação par. Ler antes de enviar
  > torna a operação idempotente.
- **FR-012a-1**: O sistema MUST NOT presumir que a seleção anterior sobreviveu.
  O operador mexe na mesa, e a seleção é estado global do Freestyler.
- **FR-012a-2**: **Verificado**: a seleção de grupos é **exclusiva** — ativar um
  grupo desativa o anterior. O sistema MUST NOT tentar desativar outros grupos
  antes de ativar o seu; ativar o seu já basta, e comandos a mais só aumentam a
  chance de erro.
- **FR-012b**: O sistema MUST reconhecer que selecionar um grupo **altera o
  estado visível do Freestyler**, e MUST registrar isso na documentação de
  operação. É efeito colateral inevitável do único caminho disponível, não
  descuido.
- **FR-012c**: O sistema MUST NOT restaurar a seleção que havia antes de aplicar
  a cor. O grupo seguidor permanece selecionado.
  > Restaurar exigiria um toggle a mais sobre um estado que pode ter mudado no
  > intervalo — o integrador devolveria uma seleção já obsoleta, pior que não
  > devolver. E cada comando a mais é risco num protocolo em que a cor não é
  > confirmável.
- **FR-013**: O integrador MUST NOT implementar transição temporizada própria
  entre a cor anterior e a nova. Cada mudança de cor é um envio único; qualquer
  suavização é responsabilidade do Freestyler.
- **FR-013a**: O comportamento observável MUST ser o **salto instantâneo**.
  **Verificado**: o protocolo do Freestyler é emulação de teclas e expõe apenas
  seleção de canal, atribuição de valor e alternância de blackout. Não há
  comando de fade alcançável por esse caminho. A opção "delegar a transição ao
  Freestyler", escolhida na clarificação, **não existe na prática** — e emular o
  efeito por envios sucessivos permanece proibido por FR-013.

#### Envio ao Freestyler

- **FR-014**: Uma aplicação de cor MUST custar um número fixo e pequeno de
  comandos — seleção do grupo mais um por slot de cor — independentemente de
  quantas fixtures o grupo contenha.
  > **Revisado.** Este requisito exigia fatiar envios acima de ~100 valores. Esse
  > limite é do caminho por canal cru, onde cada fixture custa três comandos de
  > 60–80 bytes. Pela via de grupo o custo não cresce com o número de fixtures, e
  > o fatiamento perde objeto.
- **FR-015**: O sistema MUST NOT enviar comando quando a cor resultante for
  idêntica à do **último conjunto escrito**.
- **FR-015a**: O sistema MUST distinguir a **cor pretendida** — a que deveria
  estar valendo agora — do **último conjunto escrito** — o que saiu pelo socket
  sem o TCP reclamar. Divergência entre as duas é a condição que dispara
  reenvio.
- **FR-015b**: O sistema MUST NOT afirmar que uma **cor** foi entregue ou
  confirmada. **Verificado**: nenhum comando de valor produz resposta — nem
  válido, nem com canal inexistente, nem lixo puro. Para cor, o vocabulário MUST
  refletir o observável ("escrita"), não o desejável ("entregue").
- **FR-015c**: A **seleção de grupo**, ao contrário da cor, MUST ser confirmada
  por leitura de volta. **Verificado**: consultar o status dos grupos e das
  fixtures mostra a seleção efetivada. O sistema MUST usar essa confirmação
  antes de aplicar cor, e MUST tratar seleção não confirmada como falha de
  envio (FR-029).
  > É a diferença entre "mandei e torço" e "mandei e conferi". Vale para a
  > metade do problema, e é mais do que se supunha existir.
- **FR-016**: Os envios MUST ser serializados. Nenhum envio começa antes de o
  anterior terminar.
- **FR-017**: Quando uma nova cor chega durante um envio em curso, o sistema MUST
  aplicar a cor mais recente ao final, podendo descartar cores intermediárias que
  ainda não saíram.
- **FR-031**: O sistema MUST NOT introduzir intervalo mínimo próprio entre
  envios. A não saturação do socket exigida pela constitution é consequência de
  FR-015, FR-016 e do intervalo de leitura de 1s da 001, não de uma trava
  adicional. Se a verificação contra o Freestyler real mostrar perda de comando,
  este requisito MUST ser revisitado com o caso concreto em mãos.

#### Resiliência

- **FR-018**: O sistema MUST subir e operar com o Freestyler ausente, e MUST NOT
  encerrar o processo por indisponibilidade do Freestyler em nenhum momento.
- **FR-019**: O sistema MUST tentar reconectar ao Freestyler automaticamente, com
  intervalo crescente até um teto configurável.
- **FR-020**: Ao reconectar, o sistema MUST aplicar a **cor pretendida** às
  fixtures seguidoras, sem reproduzir as cores que passaram durante a
  indisponibilidade.
- **FR-029**: Um envio fatiado MUST ser tratado como tudo-ou-nada. Falha em
  qualquer lote MUST NOT avançar o último conjunto escrito, mesmo que lotes
  anteriores tenham saído.
- **FR-029a**: Após falha de envio, o sistema MUST reagendar o envio completo da
  cor pretendida **mesmo sem queda de conexão** — um lote pode se perder com o
  socket vivo. A reagendagem MUST usar intervalo crescente até um teto, para não
  saturar um alvo já em dificuldade.
- **FR-029b**: O sistema MUST registrar em log a falha de envio e a divergência
  resultante entre cor pretendida e último conjunto escrito, para que um palco
  em duas cores seja diagnosticável pelo log.
- **FR-021**: O sistema MUST registrar em log as transições de disponibilidade do
  Freestyler uma vez por transição, não a cada tentativa.
- **FR-021a**: O sistema MUST tratar a **ausência de heartbeat** como perda de
  disponibilidade do Freestyler, sem esperar por falha de escrita.
  **Verificado**: o Freestyler emite um byte `0xFF` a cada ~1499 ms,
  independentemente do tráfego. Um socket TCP aberto não denuncia uma mesa
  travada — os `write` continuam "funcionando" para o vazio, possivelmente para
  sempre. O heartbeat é o único sinal de saúde disponível.
- **FR-021b**: A janela de tolerância antes de declarar perda MUST ser
  configurável e MUST acomodar **pelo menos três batimentos perdidos com folga**
  — no mínimo 4500 ms, dado o pulso observado de ~1499 ms.
  > **Corrigido em 2026-07-29.** A redação anterior pedia dois batimentos e o
  > mínimo era 3000 ms. Dois batimentos são 2998 ms: a margem contra atraso de
  > escalonamento do event loop era de **2 ms**, o que na prática significa
  > nenhuma. Um GC mais longo bastaria para declarar queda falsa.
- **FR-021c**: O sistema MUST NOT interpretar o heartbeat como confirmação de
  comando. Ele chega no ritmo próprio, mesmo sem tráfego algum (FR-015b).
- **FR-028**: Ao receber pedido de encerramento, o sistema MUST NOT comandar
  fixture alguma. As seguidoras permanecem no último valor enviado. Encerrar é
  parar de comandar, não deixar um estado final.
- **FR-028a**: O encerramento MUST aguardar apenas a conclusão de um envio já em
  curso, e MUST NOT iniciar envio novo — inclusive de repouso.

#### Configuração e observabilidade

- **FR-022**: A configuração desta feature MUST viver no mesmo arquivo já usado
  pela 001, sem introduzir segundo arquivo nem flags de linha de comando.
- **FR-023**: O host e a porta do Freestyler MUST ser configuráveis, nunca fixos
  no código, mesmo com a topologia sendo `localhost`.
- **FR-024**: O sistema MUST registrar, em nível detalhado, cada aplicação de
  cor: a cor de origem, o grupo selecionado e o valor de cada slot enviado.
- **FR-025**: O sistema MUST registrar, em nível normal, as transições de estado
  — cor aplicada, entrada e saída de repouso, disponibilidade do Freestyler —
  sem uma linha por evento consumido.
- **FR-025a**: Na inicialização e a cada reconexão, o sistema MUST registrar o
  inventário lido do Freestyler: versão, grupos encontrados e qual deles foi
  resolvido como seguidor. É o que permite diagnosticar configuração errada sem
  abrir a mesa.

> **A ferramenta de calibração foi removida da spec em 2026-07-29.** Ela ocupava
> os requisitos FR-030 a FR-030c e existia por uma razão só: descobrir qual
> luminária física está em qual endereço, acendendo uma por vez e olhando para o
> salão. A verificação mostrou que o Freestyler **responde** nome e endereço de
> cada fixture, e o status de seleção — a informação que ela ia descobrir na
> tentativa e erro está disponível para consulta. Some junto a regra de recusar
> execução com o serviço no ar, que só existia por causa dela.
>
> A capacidade não se perdeu: FR-025a põe o mesmo inventário no log, sem
> ferramenta separada, sem parar o serviço e sem mexer em luz nenhuma.

#### Repouso

- **FR-026**: Quando não há apresentação em exibição, o sistema MUST aplicar às
  fixtures seguidoras uma **cor de repouso declarada na configuração**, tratada
  como qualquer outra cor — mesmo mapeamento de canais, mesma supressão de envio
  redundante.
- **FR-026a**: A cor de repouso MUST ser obrigatória na configuração quando
  houver ao menos uma fixture seguidora declarada. Não há valor padrão implícito:
  o neutro depende da instalação e MUST ser uma escolha explícita do operador.
- **FR-026b**: Preto (todos os componentes em zero) MUST ser aceito como cor de
  repouso válida. É assim que o operador escolhe apagar as seguidoras entre
  apresentações.
- **FR-026c**: O sistema MUST distinguir "sem apresentação" de "apresentação cuja
  cor é preta". A primeira leva ao repouso; a segunda é uma cor anunciada como
  outra qualquer e MUST ser aplicada como tal.
- **FR-026d**: A cor de repouso MUST ser única para todas as fixtures
  seguidoras, declarada uma só vez na configuração. A configuração MUST NOT
  aceitar cor de repouso por fixture.
- **FR-027**: O sistema MUST NOT comandar nada até receber o primeiro
  `cor_anunciada`. Enquanto isso, as fixtures do grupo seguidor permanecem como
  o operador as deixou, por tempo indeterminado.
  > **Revertido em 2026-07-29.** A primeira rodada de clarificação decidiu o
  > oposto — aplicar repouso já na subida —, e o motivo era bom: sem apresentação
  > desde o início, a 001 não emite `apresentacao_encerrada`, que é evento de
  > transição, então esperar por evento poderia significar esperar para sempre.
  >
  > O que mudou foi a premissa, não o raciocínio. Naquele momento comandar era
  > invisível: supunha-se escrita direta em canais DMX. Verificou-se que aplicar
  > cor exige **selecionar o grupo**, o que altera o que o operador vê na mesa —
  > e a subida do serviço é justamente quando ele está configurando as coisas.
  > Entrar puxando a seleção dele foi julgado pior que deixar as fixtures como
  > estão até haver cor real para aplicar.
- **FR-027a**: A partir do primeiro `cor_anunciada`, o repouso passa a valer
  normalmente: `apresentacao_encerrada` leva as seguidoras à cor de repouso
  (FR-004), e a partir daí o estado de saída existe e é reaplicado na reconexão
  (FR-020).
- **FR-027b**: O sistema MUST registrar em log que está aguardando a primeira
  cor antes de comandar. Sem essa linha, "ainda não houve apresentação" e
  "integrador quebrado" têm o mesmo sintoma: nada acontece.

### Key Entities

- **Grupo seguidor**: um grupo do Freestyler, identificado pelo nome que ele tem
  lá, que o operador autorizou o integrador a comandar. O integrador não conhece
  as fixtures que o compõem nem os endereços delas — quem sabe isso é a mesa.
  Tudo que está fora do grupo é invisível para o integrador.
- **Inventário**: o que o Freestyler responde quando perguntado — versão, nomes
  dos grupos, nomes e endereços das fixtures, e o que está selecionado. É lido
  na subida e a cada reconexão, e serve para resolver o nome configurado e para
  diagnosticar configuração errada. Nada dele é declarado em arquivo.
- **Cor de repouso**: a cor declarada na configuração que vale quando não há
  apresentação em exibição. Obrigatória quando há grupo seguidor configurado.
  Preto é valor válido e significa apagar.
- **Estado de saída**: duas coisas distintas, deliberadamente separadas. A **cor
  pretendida** é a que deveria estar valendo agora — vem do último
  `cor_anunciada`, ou é a cor de repouso. O **último conjunto escrito** é o que
  saiu pelo socket sem o TCP reclamar. Quando as duas coincidem, não há o que
  enviar (FR-015); quando divergem, há envio pendente (FR-029a). Só a cor
  pretendida é reaplicada na reconexão (FR-020).
  > A palavra é "escrito", não "entregue". Para cor não há confirmação
  > (FR-015b); para seleção de grupo há (FR-015c). Misturar os dois casos num
  > vocabulário só foi o erro que a verificação corrigiu.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Anunciada uma cor, as fixtures seguidoras a exibem em até 1 segundo.
- **SC-002**: Em uma sessão completa de culto, nenhuma fixture fora do grupo
  seguidor muda de estado por ação do integrador — verificável observando as
  demais fixtures e por inspeção do log, que registra qual grupo foi selecionado
  em cada aplicação.
- **SC-003**: O serviço sobe e permanece operando com o Freestyler fechado, por
  pelo menos 30 minutos, sem encerrar o processo.
- **SC-004**: Restabelecido o Freestyler, as fixtures seguidoras exibem a cor
  corrente em até 30 segundos, sem intervenção manual.
- **SC-005**: Durante 30 minutos com a apresentação parada na mesma cor, o número
  de comandos enviados ao Freestyler é zero após a aplicação inicial.
- **SC-006**: Um nome de grupo inexistente não derruba o serviço, e o log basta
  para corrigir a configuração: nomeia o que foi procurado e lista o que existe.
- **SC-007**: A partir do log detalhado de uma única aplicação de cor, é possível
  reconstruir a cor de origem, o grupo atingido e o valor de cada slot, sem
  consultar o código.
- **SC-008**: Encerrada a apresentação **depois de ao menos uma cor ter sido
  aplicada**, as fixtures seguidoras exibem a cor de repouso configurada em até 1
  segundo, e uma apresentação de cor preta é visualmente distinguível de "sem
  apresentação" sempre que a cor de repouso não for preta.
- **SC-011**: Subindo o serviço sem apresentação no Holyrics, nenhum comando
  chega ao Freestyler e a seleção de grupos da mesa permanece como o operador a
  deixou — verificável consultando o status de grupos antes e depois.
- **SC-009**: Configurar o integrador exige do operador **apenas o nome de um
  grupo que ele já criou no Freestyler** — nenhum endereço DMX, nenhum offset de
  canal, nenhuma contagem de fixtures.
- **SC-010**: Após uma falha de envio, o sistema restabelece a cor pretendida em
  todas as fixtures seguidoras sem intervenção manual, e a divergência fica
  registrada no log enquanto durar.

## Assumptions

- **A 001 é pré-requisito, não parte desta feature.** Esta spec consome o
  contrato de eventos existente e não o altera. Se o consumo revelar necessidade
  de mudança no contrato, isso é correção da 001, feita explicitamente.
- **Universo e endereçamento são problema do Freestyler.** O integrador fala em
  grupo; quem sabe endereço, universo e patch é a mesa. Isso deixou de ser
  suposição nossa e passou a ser responsabilidade dela.
- **Somente mistura RGB.** Os três slots de cor (vermelho, verde, azul) são os
  únicos usados. Âmbar, branco, dimmer separado, strobe e movimento ficam
  intocados — inclusive dentro do grupo seguidor. Uma fixture que precise de
  dimmer aberto para a cor aparecer é responsabilidade do operador, resolvida
  por cena fixa no Freestyler.
- **O integrador conhece parte do estado.** Ele sabe qual grupo está selecionado,
  porque pergunta (FR-015c). Não sabe o valor corrente dos canais de cor — não há
  consulta para isso. Se alguém mexer manualmente na cor, o integrador não
  percebe e continua suprimindo envio redundante com base no que ele mesmo
  escreveu.
- **Cor sólida, sem efeito.** Nenhum chase, nenhuma cena temporizada, nenhum
  strobe. Fora de escopo por decisão de projeto registrada em `CLAUDE.md`. A
  suavização entre cores, se existir, vem do Freestyler — o integrador não a
  produz (FR-013).
- **Não há fade acessível.** Verificado: a tabela de comandos do fabricante não
  expõe controle de fade para os slots de cor. O comportamento é o salto
  instantâneo, e emular o efeito por envios sucessivos permanece proibido.
- **O contrato do Freestyler foi verificado em 2026-07-29** contra FreeStyler
  4.1.7 com hardware real: descoberta de grupos e fixtures, seleção de grupo com
  confirmação por leitura de volta, e coloração RGB do grupo selecionado.
  Registro completo em [contracts/freestyler.md](contracts/freestyler.md).
- **A configuração depende de nomes que vivem fora do repositório.** O nome do
  grupo é definido no Freestyler, e o operador pode renomeá-lo sem avisar
  ninguém. É o preço de não duplicar o patch: em troca, some a chance de o
  arquivo e a mesa discordarem em silêncio sobre endereços. O risco de nome
  quebrado é tratado por FR-010 e FR-011, que exigem detecção e log acionável.
- **A biblioteca `freestyler_node_connector` não será usada.** Ela registra
  `process.on('uncaughtException', … process.exit())`, o que daria a um pacote
  parado desde 2015 o poder de derrubar o serviço — inaceitável sob o Princípio
  IV. Também fixa a porta 3332 no código, contrariando FR-023. O protocolo é
  implementado direto sobre `node:net`, e o repositório dela fica citado como
  fonte do formato.
- **O limite de ~100 valores por lote não se aplica a esta feature.** Ele é do
  caminho por canal cru, onde cada fixture custa três comandos. Pela via de
  grupo, uma aplicação de cor custa quatro comandos no total, independentemente
  de quantas fixtures o grupo tenha.
- **O teto de reconexão e o intervalo inicial** seguem o que já foi decidido na
  001 para o Holyrics, salvo evidência de que o Freestyler precisa de outro
  ritmo. O mesmo vale para o reagendamento de envio após falha (FR-029a).
- **Selecionar o grupo mexe no que o operador vê na mesa.** É efeito colateral
  do único caminho disponível: para colorir, é preciso selecionar. Se ele estiver
  operando o Freestyler manualmente ao mesmo tempo, verá a seleção mudar sozinha.
  Registrado em FR-012b e na documentação de operação.
- **Um grupo só.** A configuração declara um grupo seguidor, não uma lista.
  Vários grupos com cores diferentes é caso que ainda não existe (Princípio V).

## Out of Scope

- Interface web ou qualquer UI. A configuração vive em arquivo.
- Cenas, chases, efeitos temporizados, strobe.
- Gobo, movimento, âmbar, branco — qualquer slot que não seja R/G/B.
- Suporte a outro software de iluminação além do Freestyler.
- Alterar o comportamento de leitura especificado na 001.
- **Ferramenta de calibração separada.** Removida em 2026-07-29: o Freestyler
  responde nome e endereço das fixtures, então não há o que descobrir por
  tentativa e erro. O inventário vai para o log (FR-025a).
- **Comando por canal cru.** O caminho `CLR / @ / DMX / ENTER` está verificado e
  funciona, mas não é implementado: exigiria de volta o endereçamento em arquivo
  que esta revisão eliminou. Fica documentado em
  [contracts/freestyler.md](contracts/freestyler.md) como alternativa conhecida.
- **Mais de um grupo seguidor**, ou grupos com cores distintas.
- Reação das luzes ao avanço de slide (FR-006).
- Transição temporizada de cor produzida pelo integrador (FR-013).
- Intervalo mínimo próprio entre envios ao Freestyler (FR-031).
