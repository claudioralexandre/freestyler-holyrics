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
- Q: Quando o serviço sobe e ainda não recebeu nenhum evento, o que acontece com
  as fixtures seguidoras? → A: A cor de repouso é aplicada imediatamente na
  subida, antes de qualquer leitura (FR-027). Esperar evento não serve: se nunca
  houve apresentação, a 001 não emite `apresentacao_encerrada`, porque esse
  evento é uma transição.
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
- Q: Como o operador descobre qual lâmpada física corresponde a cada fixture da
  config? → A: Por um script de calibração separado, que acende sob comando uma
  fixture nomeada (FR-030). O serviço de culto não ganha modo especial.
- Q: E se a calibração rodar com o serviço no ar? → A: A ferramenta recusa
  (FR-030c). Escrita por fora deixa o serviço achando que entregou a cor certa,
  e a supressão de envio redundante impede a correção até a próxima mudança —
  falha silenciosa que o log não acusa.
- Q: Deve haver intervalo mínimo obrigatório entre envios ao Freestyler? → A:
  Não (FR-031). A taxa já está limitada pela leitura de 1s da 001, pela
  confirmação por permanência, pela serialização (FR-016) e pela supressão de
  redundância (FR-015). O limite próprio só se justifica se a verificação contra
  o Freestyler real mostrar perda de comando.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A luz assume a cor do telão (Priority: P1)

Durante o culto, a apresentação muda para uma música de fundo azul. Alguns
segundos depois, as fixtures que o operador declarou como seguidoras assumem esse
azul. Ninguém tocou em nada. As demais fixtures — as que iluminam o púlpito, as
que estão em uma cena fixa — continuam exatamente como estavam.

**Why this priority**: é a feature. Sem isto, nada do projeto se manifesta no
mundo físico. Todo o resto desta spec é resiliência ou refinamento em volta deste
comportamento.

**Independent Test**: com o Freestyler aberto e uma fixture RGB declarada na
config, alimentar um evento `cor_anunciada` e observar a fixture assumir a cor.
Sem Holyrics: o evento pode ser injetado diretamente, porque o contrato da 001 é
uma assinatura em memória.

**Acceptance Scenarios**:

1. **Given** duas fixtures declaradas como seguidoras e uma terceira ausente da
   config, **When** chega `cor_anunciada` com uma cor, **Then** as duas
   declaradas recebem os valores R/G/B correspondentes e a terceira não recebe
   comando nenhum.
2. **Given** uma fixture seguidora já na cor anunciada, **When** chega um novo
   `cor_anunciada` com a mesma cor, **Then** nenhum comando é enviado ao
   Freestyler.
3. **Given** o serviço acabou de subir e ainda não houve anúncio de cor,
   **When** o primeiro `cor_anunciada` chega com `motivo: primeira_leitura`,
   **Then** as fixtures seguidoras assumem a cor da mesma forma que numa
   mudança confirmada.

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
5. **Given** o serviço recém-iniciado, sem nenhum evento recebido, **When** ele
   termina de subir, **Then** as fixtures seguidoras já estão na cor de repouso
   — sem depender de o Holyrics estar aberto ou de haver apresentação.
6. **Given** uma apresentação em exibição cuja cor extraída é preta, **When**
   ela é anunciada, **Then** ela é aplicada como cor normal — o sistema não a
   confunde com repouso nem a suprime.

---

### User Story 4 - O operador consegue calibrar o mapeamento (Priority: P4)

O endereçamento DMX de uma instalação real raramente confere de primeira: o
canal vermelho de uma fixture pode estar onde se esperava o verde, ou a fixture
pode começar num endereço diferente do anotado. O operador precisa ver o que o
integrador está mandando para descobrir isso, sem ter que adivinhar.

**Why this priority**: não muda o comportamento, mas é o que torna as três
histórias acima ajustáveis contra hardware real. Sem isso, um mapeamento errado
é indistinguível de um bug.

**Independent Test**: com a ferramenta de calibração, acender uma fixture
nomeada e confirmar no salão qual luminária respondeu.

**Acceptance Scenarios**:

1. **Given** a configuração com várias fixtures seguidoras, **When** o operador
   pede à ferramenta de calibração para acender uma delas pelo nome, **Then**
   apenas aquela fixture acende, e é possível identificá-la fisicamente.
2. **Given** o log em nível detalhado, **When** uma cor é aplicada, **Then** o
   registro nomeia a fixture, a cor de origem e cada par canal→valor enviado.
3. **Given** a configuração de fixtures inválida, **When** o serviço sobe,
   **Then** ele recusa a subir com uma mensagem que identifica a fixture e o
   campo problemático.
4. **Given** um nome de fixture ausente da configuração, **When** o operador o
   passa à ferramenta de calibração, **Then** ela recusa e lista os nomes
   válidos.

---

### Edge Cases

- **Cor anunciada durante a queda do Freestyler.** Não vira fila. Vale a cor
  corrente no momento em que a conexão volta (US2, cenário 2).
- **Duas fixtures compartilhando canais.** A configuração pode declarar
  endereços sobrepostos por engano. É erro de configuração e deve ser recusado
  na subida, não descoberto no palco.
- **Endereço DMX fora da faixa válida do universo.** Recusado na validação.
- **Mais fixtures do que cabe em um envio.** O conector do Freestyler não aceita
  mais de ~100 valores por lote; o envio precisa ser fatiado.
- **Cor idêntica à última enviada.** Não gera tráfego. O Freestyler é um alvo
  frágil e o protocolo emula teclas.
- **`cor_anunciada` chegando enquanto o envio anterior ainda está em curso.** Os
  envios não se sobrepõem; a cor mais recente prevalece sobre uma intermediária
  que ainda não saiu.
- **Nenhuma fixture declarada como seguidora.** É configuração legítima — o
  serviço sobe, consome eventos e não comanda nada.
- **Evento `slide_mudou`.** Não produz efeito nesta feature, por decisão
  explícita (FR-006). Continua no log.
- **Apresentação cuja cor extraída é preta.** É cor legítima e vai para as
  fixtures. Não deve ser confundida com o repouso, que só vale quando não há
  apresentação alguma (FR-026c).
- **Fade do Freestyler não verificado.** Até haver observação contra a
  ferramenta real, o comportamento é salto instantâneo e a suposição fica
  marcada no código (FR-013a).

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

#### Fixtures e mapeamento

- **FR-008**: A configuração MUST declarar explicitamente quais fixtures seguem a
  cor. Fixture não declarada MUST NOT receber comando algum do integrador, em
  nenhuma circunstância.
- **FR-009**: Cada fixture seguidora MUST ser declarada com identificação
  legível, endereço inicial e a posição relativa dos canais vermelho, verde e
  azul.
- **FR-010**: O sistema MUST validar a configuração de fixtures na inicialização
  e recusar subir se ela for inválida, identificando na mensagem a fixture e o
  campo em falta.
- **FR-011**: A validação MUST rejeitar: endereço inicial fora da faixa válida do
  universo DMX; endereço inicial somado a qualquer offset ultrapassando essa
  faixa; canal ocupado por mais de uma fixture; e nomes de fixture repetidos,
  já que o nome é a chave usada pela ferramenta de calibração (FR-030a).
- **FR-012**: O sistema MUST mapear os componentes da cor anunciada diretamente
  para os canais correspondentes, sem correção de gama, curva ou calibração por
  fixture.
- **FR-013**: O integrador MUST NOT implementar transição temporizada própria
  entre a cor anterior e a nova. Cada mudança de cor é um envio único; qualquer
  suavização é responsabilidade do Freestyler.
- **FR-013a**: Se o Freestyler oferecer controle de fade próprio, o sistema MUST
  permitir configurá-lo e MUST se limitar a acioná-lo — nunca a emular o efeito
  por envios sucessivos. Enquanto essa capacidade não for verificada contra o
  Freestyler real, o comportamento observável MUST ser o salto instantâneo, e a
  suposição MUST estar marcada como não verificada no código que a assume
  (Princípio I).

#### Envio ao Freestyler

- **FR-014**: O sistema MUST fatiar qualquer envio que ultrapasse o limite de
  ~100 valores por lote do conector.
- **FR-015**: O sistema MUST NOT enviar comando quando os valores resultantes
  forem idênticos ao **último conjunto entregue com sucesso**.
- **FR-015a**: O sistema MUST distinguir a **cor pretendida** — a que deveria
  estar valendo agora — do **último conjunto entregue com sucesso** — o que o
  sistema conseguiu confirmar que saiu. Divergência entre as duas é a condição
  que dispara reenvio.
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
  qualquer lote MUST NOT avançar o último conjunto entregue, mesmo que lotes
  anteriores tenham saído.
- **FR-029a**: Após falha de envio, o sistema MUST reagendar o envio completo da
  cor pretendida **mesmo sem queda de conexão** — um lote pode se perder com o
  socket vivo. A reagendagem MUST usar intervalo crescente até um teto, para não
  saturar um alvo já em dificuldade.
- **FR-029b**: O sistema MUST registrar em log a falha de envio e a divergência
  resultante entre cor pretendida e último conjunto entregue, para que um palco
  em duas cores seja diagnosticável pelo log.
- **FR-021**: O sistema MUST registrar em log as transições de disponibilidade do
  Freestyler uma vez por transição, não a cada tentativa.
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
  cor: a cor de origem, a fixture atingida e cada par canal→valor enviado.
- **FR-025**: O sistema MUST registrar, em nível normal, as transições de estado
  — cor aplicada, entrada e saída de repouso, disponibilidade do Freestyler —
  sem uma linha por evento consumido.
- **FR-030**: O projeto MUST oferecer uma ferramenta de calibração separada do
  serviço, capaz de acender sob comando uma fixture nomeada na configuração, com
  uma cor informada pelo operador.
- **FR-030a**: A ferramenta de calibração MUST ler a mesma configuração do
  serviço e MUST NOT aceitar nome de fixture ausente dela — calibrar um endereço
  que o serviço não conhece não ajuda ninguém.
- **FR-030b**: O serviço de culto MUST NOT conter modo, flag ou caminho de código
  destinado à calibração. A separação é o que mantém o processo que roda durante
  o culto sem comportamento alternativo.
- **FR-030c**: A ferramenta de calibração MUST recusar executar enquanto o
  serviço estiver em execução, orientando o operador a pará-lo antes. Escrita
  simultânea nos mesmos canais deixaria o serviço convicto de ter entregue uma
  cor que não está mais valendo, e a supressão de envio redundante (FR-015)
  impediria a correção até a próxima mudança — falha que o log não acusa.

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
- **FR-027**: Na inicialização, antes de qualquer leitura do Holyrics e de
  qualquer evento recebido, o sistema MUST aplicar a cor de repouso às fixtures
  seguidoras. Não é aceitável aguardar evento: se nunca houve apresentação, a 001
  não emite `apresentacao_encerrada`, por ser evento de transição.
- **FR-027a**: A cor de repouso aplicada na inicialização MUST passar a ser o
  estado de saída corrente, de modo que a reaplicação na reconexão (FR-020)
  cubra o caso do Freestyler ainda fechado quando o serviço subiu.

### Key Entities

- **Fixture seguidora**: uma luminária RGB que o operador autorizou o integrador a
  comandar. Tem identificação legível, um endereço inicial no universo DMX e a
  posição relativa dos três canais de cor. Fixtures ausentes desta lista são
  invisíveis para o integrador.
- **Comando de canal**: o par canal→valor efetivamente enviado. É a unidade que o
  limite de ~100 valores por lote conta, e a unidade que o log detalhado precisa
  expor para permitir calibração.
- **Cor de repouso**: a cor declarada na configuração que vale quando não há
  apresentação em exibição. Obrigatória quando existe ao menos uma fixture
  seguidora. Preto é valor válido e significa apagar.
- **Estado de saída**: duas coisas distintas, deliberadamente separadas. A **cor
  pretendida** é a que deveria estar valendo agora — vem do último
  `cor_anunciada`, ou é a cor de repouso. O **último conjunto entregue** é o que
  o sistema confirmou que saiu inteiro. Quando as duas coincidem, não há o que
  enviar (FR-015); quando divergem, há envio pendente (FR-029a). Só a cor
  pretendida é reaplicada na reconexão (FR-020).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Anunciada uma cor, as fixtures seguidoras a exibem em até 1 segundo.
- **SC-002**: Em uma sessão completa de culto, nenhum canal fora dos declarados na
  configuração recebe valor do integrador — verificável por inspeção do log
  detalhado contra a lista de fixtures.
- **SC-003**: O serviço sobe e permanece operando com o Freestyler fechado, por
  pelo menos 30 minutos, sem encerrar o processo.
- **SC-004**: Restabelecido o Freestyler, as fixtures seguidoras exibem a cor
  corrente em até 30 segundos, sem intervenção manual.
- **SC-005**: Durante 30 minutos com a apresentação parada na mesma cor, o número
  de comandos enviados ao Freestyler é zero após a aplicação inicial.
- **SC-006**: Uma configuração de fixtures inválida impede a subida do serviço e
  produz mensagem que permite corrigir o arquivo sem consultar o código.
- **SC-007**: A partir do log detalhado de uma única aplicação de cor, é possível
  reconstruir quais canais receberam quais valores sem consultar o código.
- **SC-008**: Encerrada a apresentação, as fixtures seguidoras exibem a cor de
  repouso configurada em até 1 segundo, e uma apresentação de cor preta é
  visualmente distinguível de "sem apresentação" sempre que a cor de repouso não
  for preta.
- **SC-009**: Com a ferramenta de calibração, um operador que não conhece o
  endereçamento identifica fisicamente cada fixture seguidora da configuração,
  uma por vez, sem consultar o código nem o Freestyler.
- **SC-010**: Após uma falha de envio, o sistema restabelece a cor pretendida em
  todas as fixtures seguidoras sem intervenção manual, e a divergência fica
  registrada no log enquanto durar.

## Assumptions

- **A 001 é pré-requisito, não parte desta feature.** Esta spec consome o
  contrato de eventos existente e não o altera. Se o consumo revelar necessidade
  de mudança no contrato, isso é correção da 001, feita explicitamente.
- **Um único universo DMX.** O conector do Freestyler endereça canais sem noção
  de universo; a configuração assume o mesmo. Segundo universo é caso que ainda
  não existe (Princípio V).
- **Somente fixtures RGB.** RGBW, RGBA, âmbar, dimmer separado ou canal de
  strobe estão fora. Uma fixture com dimmer que precise estar aberto para a cor
  aparecer é responsabilidade do operador, resolvida por cena fixa no Freestyler.
- **O integrador não conhece o estado real das luzes.** Ele só sabe o que enviou.
  Se alguém mexer no Freestyler manualmente, o integrador não percebe e continua
  suprimindo envio redundante com base no que ele mesmo mandou.
- **Cor sólida, sem efeito.** Nenhum chase, nenhuma cena temporizada, nenhum
  strobe. Fora de escopo por decisão de projeto registrada em `CLAUDE.md`. A
  suavização entre cores, se existir, vem do Freestyler — o integrador não a
  produz (FR-013).
- **O fade próprio do Freestyler é hipótese, não fato.** Ninguém observou se o
  conector expõe controle de fade. Enquanto isso, o comportamento especificado e
  testável é o salto instantâneo; a capacidade de acionar fade só entra depois
  de verificada, e sem virar emulação por envios sucessivos.
- **O contrato do Freestyler continua não verificado.** Tudo que se sabe do
  conector veio de documentação pública: a porta 3332, o formato `FSOC{n}255`
  emulando teclas, o limite de ~100 valores por lote. Pelo Princípio I, o código
  que assumir esses valores MUST carregar a marcação de não verificado até haver
  observação contra o Freestyler real.
- **O teto de reconexão e o intervalo inicial** seguem o que já foi decidido na
  001 para o Holyrics, salvo evidência de que o Freestyler precisa de outro
  ritmo. O mesmo vale para o reagendamento de envio após falha (FR-029a).
- **A ferramenta de calibração deixa a fixture acesa** ao terminar. Ela existe
  para o operador olhar para o salão e identificar a luminária; apagar ao sair
  derrotaria o propósito. O estado é resolvido na subida seguinte do serviço,
  que aplica o repouso (FR-027).
- **A calibração é atividade de antes do culto.** É o que torna aceitável a
  recusa de FR-030c — se ela precisasse rodar durante, a decisão seria outra.

## Out of Scope

- Interface web ou qualquer UI. O mapeamento vive em arquivo de configuração.
- Cenas, chases, efeitos temporizados, strobe.
- Fixtures móveis, gobo, ou qualquer canal que não seja R/G/B.
- Suporte a outro software de iluminação além do Freestyler.
- Descobrir automaticamente as fixtures existentes no Freestyler.
- Alterar o comportamento de leitura especificado na 001.
- Modo de calibração dentro do serviço de culto (FR-030b).
- Reação das luzes ao avanço de slide (FR-006).
- Transição temporizada de cor produzida pelo integrador (FR-013).
- Intervalo mínimo próprio entre envios ao Freestyler (FR-031).
