# Feature Specification: Leitura de cor do Holyrics

**Feature Branch**: `001-leitura-cor-holyrics`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "Primeira feature do integrador, limitada ao lado de entrada: conectar ao Holyrics, ler periodicamente a cor predominante da apresentação em exibição, detectar troca de apresentação e produzir um sinal de cor estável. Sem envio DMX — a saída é apenas estado interno observável e log."

## Clarifications

### Session 2026-07-28

- Q: A diferença entre a cor lida e a cor de referência é medida pelos componentes de cor crus ou por uma medida perceptual? → A: Perceptual — a comparação usa uma medida de diferença de cor alinhada à percepção humana (ΔE), não a distância direta entre componentes.
- Q: Além de ultrapassar o limiar, a cor nova precisa se manter por alguns instantes antes de ser anunciada? → A: Sim — confirmação por permanência: a mudança só é anunciada após N leituras consecutivas acima do limiar (N configurável, padrão 2).
- Q: A cor corrente vem de uma única região da tela ou de uma combinação das oito? → A: Região única, indicada na configuração. Nenhuma combinação de regiões no núcleo.
- Q: Como o sinal de cor fica disponível para o consumidor futuro? → A: Em memória, no mesmo processo — o consumidor se inscreve e é chamado a cada evento. Sem canal de rede, sem arquivo de estado, sem formato de mensagem publicado.
- Q: O log precisa persistir em arquivo ou basta o terminal? → A: Arquivo com rotação, com destino e verbosidade configuráveis, mais saída no terminal quando houver um.
- Q: Troca de item com cor praticamente igual deve reanunciar a cor? → A: Não — evento de item e mudança de cor permanecem independentes. A troca de item não descarta nem reanuncia a cor de referência.
- Q: Avançar de estrofe dentro da mesma música conta como troca? → A: Sim — avanço de slide emite evento próprio, distinto da troca de item. Expande deliberadamente o escopo, para permitir mais de um gatilho por música.
- Q: O tema atual e suas etiquetas entram no escopo? → A: Sim, como observação apenas — o tema e suas tags são lidos, reportados no estado e no log, mas não influenciam a cor anunciada.
- Q: Qual o teto do intervalo entre tentativas com o Holyrics fora do ar? → A: 15 segundos, partindo de 1 segundo e dobrando a cada falha — folga suficiente dentro do SC-005.
- Q: Falha parcial dentro de um ciclo descarta o ciclo inteiro? → A: Não — as consultas são independentes: cada uma que respondeu atualiza seu pedaço do estado, a que falhou mantém o valor anterior e registra a falha.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber qual cor está na tela agora (Priority: P1)

O operador liga o integrador com o Holyrics já projetando uma música. O
integrador passa a acompanhar continuamente o que está na tela pública e, a cada
instante, sabe dizer qual é a cor predominante da apresentação atual. Esse valor
fica visível no log, para que o operador possa conferir a olho se a cor lida
corresponde ao que ele vê no telão.

**Why this priority**: é a razão de existir da feature. Sem uma cor correta e
confiável, nada do que vem depois (DMX, fixtures) tem sentido. Entregue sozinha,
já permite validar contra o Holyrics real que a leitura de cor funciona — que é
o maior risco do projeto.

**Independent Test**: com o Holyrics projetando uma música de tema conhecido,
iniciar o integrador e verificar no log que a cor anunciada corresponde
visualmente ao telão; trocar para um tema de cor claramente diferente e verificar
que a cor anunciada muda de acordo.

**Acceptance Scenarios**:

1. **Given** o Holyrics está em execução e exibindo uma apresentação de tema
   predominantemente azul, **When** o integrador é iniciado, **Then** já no
   primeiro ciclo de leitura ele anuncia uma cor cujo componente azul é o
   dominante.
2. **Given** o integrador está acompanhando uma apresentação, **When** o tema em
   exibição é trocado por outro de cor claramente distinta, **Then** o integrador
   anuncia a nova cor sem intervenção manual, dentro do prazo do SC-002.
3. **Given** o integrador está em execução, **When** o operador consulta o log,
   **Then** cada cor anunciada aparece com o horário e com os componentes de cor
   legíveis.

---

### User Story 2 - Não perseguir variação irrelevante (Priority: P2)

Fundos de apresentação são imagens e vídeos: mesmo com o telão parado, a cor lida
varia um pouco a cada leitura. O integrador só anuncia uma mudança de cor quando
ela é grande o suficiente para importar, de modo que o consumidor dessa
informação (no futuro, as fixtures) não receba um fluxo de micro-oscilações.

**Why this priority**: é o que separa um sinal utilizável de um sinal ruidoso.
Sem isso, a feature entrega dados tecnicamente corretos e praticamente
inservíveis — e a constitution proíbe repassar toda variação adiante. Depende da
US1 existir, por isso P2.

**Independent Test**: alimentar a lógica de estabilidade com uma sequência de
leituras que oscilam levemente em torno de uma mesma cor e verificar que nenhuma
mudança é anunciada; inserir um salto grande e passageiro (uma leitura só) e
verificar que nada é anunciado; inserir um salto grande e sustentado e verificar
que exatamente uma mudança é anunciada. Testável sem Holyrics em execução.

**Acceptance Scenarios**:

1. **Given** uma cor de referência já anunciada, **When** chegam leituras que
   diferem dela abaixo do limiar de mudança, **Then** nenhuma mudança é
   anunciada e a cor de referência permanece.
2. **Given** uma cor de referência já anunciada, **When** chegam N leituras
   consecutivas acima do limiar, **Then** uma mudança é anunciada e a última
   dessas leituras vira a cor de referência.
3. **Given** uma cor de referência já anunciada, **When** chega uma única leitura
   acima do limiar seguida por outra abaixo dele, **Then** nenhuma mudança é
   anunciada e a cor de referência permanece — o salto passageiro é descartado.
4. **Given** uma sequência de leituras que se afastam gradualmente da referência,
   cada passo abaixo do limiar mas o acumulado acima, **When** as leituras
   passam a diferir da referência acima do limiar por N ciclos seguidos,
   **Then** uma mudança é anunciada.
5. **Given** nenhuma cor de referência estabelecida, **When** chega a primeira
   leitura válida, **Then** ela é anunciada de imediato, sem esperar
   confirmação.

---

### User Story 3 - Saber quando o que está na tela mudou de item (Priority: P3)

Além da cor, o integrador acompanha qual item está em exibição — a música, o
texto, o versículo — e em que ponto dele o operador está. Quando o item muda, e
quando o operador avança de estrofe dentro do mesmo item, cada uma dessas coisas
é registrada como um evento próprio, distinto da mudança de cor. Isso permite que
uma única música produza mais de um gatilho ao longo da execução. Quando não há
nada em exibição, o integrador reconhece esse estado explicitamente em vez de
continuar reportando a última cor como se fosse atual.

**Why this priority**: a troca de item é o segundo gatilho declarado do projeto e
é a informação que permite, depois, reagir na hora certa. O evento de slide
multiplica os pontos de reação dentro de uma mesma música. Mas o valor imediato é
menor que o da cor, que já funciona sozinha.

**Independent Test**: com o Holyrics projetando, trocar de música e verificar no
log um evento de troca de item com o nome do novo item; avançar de estrofe dentro
da mesma música e verificar um evento de slide, distinto do de item; encerrar a
apresentação e verificar que o integrador registra a ausência de apresentação.

**Acceptance Scenarios**:

1. **Given** uma apresentação em exibição, **When** o operador troca para outro
   item, **Then** o integrador registra um evento de troca contendo a
   identificação do item anterior e do novo.
2. **Given** um item de várias estrofes em exibição, **When** o operador avança
   para a estrofe seguinte, **Then** o integrador registra um evento de slide
   com a posição anterior e a nova, e nenhum evento de troca de item.
3. **Given** um item de várias estrofes em exibição, **When** o operador volta
   para a estrofe anterior, **Then** o integrador registra um evento de slide
   com a posição anterior e a nova.
4. **Given** um item em exibição em qualquer estrofe, **When** o operador troca
   para outro item, **Then** o integrador registra apenas o evento de troca de
   item, sem emitir também um evento de slide pela mudança de posição.
5. **Given** uma apresentação em exibição, **When** a apresentação é encerrada no
   Holyrics, **Then** o integrador passa ao estado "sem apresentação" e registra
   essa transição.
6. **Given** o estado "sem apresentação", **When** uma nova apresentação entra em
   exibição, **Then** o integrador registra a transição de volta e retoma o
   reporte de cor.

---

### User Story 4 - Sobreviver ao Holyrics ausente (Priority: P4)

O integrador pode ser iniciado antes do Holyrics, e o Holyrics pode ser fechado
ou travar no meio do culto. Em nenhum desses casos o integrador termina: ele
continua tentando, registra a perda e a recuperação, e volta a reportar cor
sozinho quando o Holyrics retorna.

**Why this priority**: exigência da constitution e condição para o serviço ser
usável de verdade num culto. Fica por último porque as três histórias anteriores
podem ser demonstradas com o Holyrics presente o tempo todo.

**Independent Test**: iniciar o integrador com o Holyrics fechado, verificar que
ele permanece vivo e registra a indisponibilidade; abrir o Holyrics e verificar
que a leitura de cor começa sem reiniciar o integrador.

**Acceptance Scenarios**:

1. **Given** o Holyrics não está em execução, **When** o integrador é iniciado,
   **Then** ele permanece em execução, registra a indisponibilidade e continua
   tentando em intervalos crescentes.
2. **Given** o integrador está reportando cor normalmente, **When** o Holyrics é
   encerrado, **Then** o integrador registra a perda de conexão e não termina.
3. **Given** o integrador está no estado de indisponibilidade, **When** o
   Holyrics volta a responder, **Then** ele registra a recuperação e retoma o
   reporte de cor sem intervenção.
4. **Given** o Holyrics responde, porém com credencial recusada, **When** o
   integrador tenta ler, **Then** ele registra a falha de autorização de forma
   distinguível de "Holyrics fechado" e não expõe a credencial no log.

---

### Edge Cases

- **Resposta de cor incompleta ou fora do formato esperado.** A leitura é
  descartada, a falha é registrada uma vez (sem repetir a cada ciclo) e a cor de
  referência anterior é mantida.
- **Consulta de item falha e a de cor responde.** A cor segue sendo avaliada e
  anunciada normalmente; o item permanece com o último valor conhecido e a falha
  parcial é registrada. O Holyrics não é dado como perdido.
- **Consulta de cor falha e a de item responde.** Eventos de item e de slide
  continuam sendo emitidos; a cor de referência é preservada e nenhuma mudança de
  cor é anunciada enquanto a consulta não voltar.
- **Estado velho por falha parcial prolongada.** O horário da última leitura
  bem-sucedida de cada consulta permanece visível no estado, de modo que dá para
  distinguir "não mudou" de "não é lido há dez minutos".
- **Tela toda preta ou toda branca.** É uma cor válida como qualquer outra: não
  recebe tratamento especial e passa pelo mesmo limiar de mudança.
- **Flash, corte de cena ou transição de slide.** O salto de cor dura menos que
  a janela de confirmação, a contagem é zerada e nada é anunciado.
- **Oscilação entre duas cores distantes.** Enquanto nenhuma delas se sustentar
  por N leituras consecutivas, nenhuma mudança é anunciada e a referência
  permanece na cor antiga.
- **Troca de item sem troca de cor.** O evento de item é registrado; nenhuma
  mudança de cor é anunciada, porque a cor não ultrapassou o limiar.
- **Item sem noção de slide** (imagem, vídeo, item de um slide só). Nenhum evento
  de slide é emitido; o item se comporta como tendo uma posição única.
- **Operador passa vários slides rapidamente.** Como a posição é observada por
  leitura periódica, avanços mais rápidos que o intervalo de leitura podem ser
  vistos como um salto único. O evento reporta a posição anterior e a nova
  observadas, sem inventar os passos intermediários.
- **Item cujo total de slides muda durante a exibição.** O total reportado
  acompanha a última leitura; nenhum evento é emitido só por essa mudança.
- **Troca de item com cor nova.** Os dois eventos são registrados; a cor de
  referência é substituída pela do novo item.
- **Leitura demora mais que o intervalo de leitura.** Os ciclos não se acumulam
  nem se sobrepõem — o ciclo seguinte só começa depois que o anterior termina ou
  expira por tempo limite.
- **Holyrics responde, mas nunca há apresentação.** O integrador permanece no
  estado "sem apresentação" indefinidamente, sem tratar isso como erro.
- **Credencial ausente na configuração.** O integrador falha ao iniciar com
  mensagem explícita, em vez de subir e falhar silenciosamente a cada ciclo.

## Requirements *(mandatory)*

### Functional Requirements

**Leitura**

- **FR-001**: O sistema MUST consultar o Holyrics em intervalo regular e
  configurável para obter a cor predominante da apresentação em exibição.
- **FR-002**: O sistema MUST derivar a cor corrente de uma única região da
  leitura, indicada na configuração, sem combinar, mediar ou ponderar regiões.
- **FR-002a**: Quando a região configurada não existir na leitura devolvida pelo
  Holyrics, o sistema MUST descartar a leitura e registrar o erro uma vez,
  informando quantas regiões vieram na resposta — sem terminar o processo, já que
  isso só é descoberto com o Holyrics em execução.
- **FR-003**: O sistema MUST consultar, no mesmo ciclo, qual item está em
  exibição, e MUST reconhecer explicitamente o estado em que não há apresentação.
- **FR-004**: O sistema MUST evitar ciclos sobrepostos: um novo ciclo só começa
  após o anterior concluir ou expirar por tempo limite.
- **FR-004a**: As consultas de um mesmo ciclo (cor, item, tema) MUST ser tratadas
  de forma independente: a falha de uma MUST NOT descartar o resultado das
  outras. Cada parte bem-sucedida atualiza seu pedaço do estado; a que falhou
  preserva o valor anterior.
- **FR-004b**: O sistema MUST registrar a falha parcial identificando qual
  consulta falhou, sem repetir a mensagem a cada ciclo enquanto a condição
  persistir.
- **FR-004c**: A disponibilidade do Holyrics MUST ser considerada perdida apenas
  quando todas as consultas do ciclo falharem; falha isolada de uma consulta é
  registrada como falha parcial, não como queda.
- **FR-005**: O sistema MUST descartar leituras cujo formato não corresponda ao
  esperado, mantendo a cor de referência anterior.
- **FR-005a**: O sistema MUST consultar também o tema atual e suas etiquetas,
  reportando-os no estado e no log.
- **FR-005b**: O tema e suas etiquetas MUST NOT influenciar a cor anunciada,
  o limiar ou a confirmação por permanência — são observação, não decisão.
  > **Emendado em 2026-07-31 pela feature 003.** As etiquetas passam a influenciar
  > a cor **quando, e somente quando, uma delas estiver declarada** na seção
  > `coresPorTag` da configuração. Sem mapeamento declarado, o texto acima
  > continua valendo palavra por palavra: o tema é observação e nada mais.
  >
  > O motivo original segue válido no que importava — cor derivada de tema **por
  > conta própria** seria adivinhação. O que mudou é que agora existe uma
  > declaração explícita do operador dizendo qual cor aquele tema deve ter. A
  > decisão saiu do sistema e foi para o arquivo.
  >
  > Ver `specs/003-override-cor-por-tag/spec.md`, seção "Emendas a features
  > anteriores".
- **FR-005c**: A ausência de tema, ou a indisponibilidade dessa informação, MUST
  NOT impedir a leitura de cor nem interromper o ciclo.

**Estabilidade do sinal**

- **FR-006**: O sistema MUST manter uma cor de referência — a última cor
  anunciada — e comparar cada nova leitura contra ela.
- **FR-007**: O sistema MUST anunciar mudança de cor somente quando a diferença
  entre a leitura e a cor de referência ultrapassar um limiar configurável.
- **FR-007a**: O sistema MUST exigir confirmação por permanência: a mudança só é
  anunciada após N leituras consecutivas cuja diferença contra a cor de
  referência ultrapasse o limiar, com N configurável e padrão 2.
- **FR-007b**: Uma leitura que volte a ficar abaixo do limiar MUST zerar a
  contagem de confirmação, de modo que um salto passageiro de cor não seja
  anunciado.
- **FR-007c**: A contagem de confirmação MUST tolerar variação entre as leituras
  candidatas: elas precisam estar acima do limiar em relação à cor de
  referência, não idênticas entre si.
- **FR-008**: O sistema MUST medir a diferença entre duas cores por uma métrica
  perceptual (ΔE), de modo que o limiar corresponda a "quanto o olho precisa
  notar" e não à distância aritmética entre componentes de cor.
- **FR-008a**: A medida de diferença MUST ser determinística: a mesma dupla de
  cores produz sempre o mesmo valor e a mesma decisão, sem depender de relógio,
  ordem de chamada ou estado externo.
- **FR-009**: O sistema MUST, ao anunciar uma mudança, adotar como nova
  referência a última leitura da sequência de confirmação — a mais recente, não
  a que iniciou a contagem.
- **FR-009a**: Quando não existe cor de referência (início do serviço ou retorno
  de "sem apresentação"), a primeira leitura válida MUST ser adotada e anunciada
  imediatamente, sem confirmação por permanência — não há referência contra a
  qual confirmar.

**Estado e eventos**

- **FR-010**: O sistema MUST registrar um evento a cada troca de item em
  exibição, identificando o item anterior e o novo.
- **FR-010a**: O sistema MUST registrar um evento a cada avanço ou retrocesso de
  slide dentro do mesmo item, identificando a posição anterior e a nova.
- **FR-010b**: O evento de slide MUST ser distinguível do evento de troca de
  item, de modo que o consumidor possa reagir a um sem reagir ao outro.
- **FR-010c**: Uma troca de item MUST NOT ser acompanhada de um evento de slide
  pela mudança de posição implícita na troca — entrar num item novo emite apenas
  o evento de item, ainda que o número do slide tenha mudado junto.
- **FR-010d**: O sistema MUST acompanhar também o total de slides do item, de
  modo que a posição reportada seja interpretável (ex.: 3 de 6).
- **FR-011**: O sistema MUST registrar as transições entre "com apresentação" e
  "sem apresentação" como eventos distintos da mudança de cor.
- **FR-012**: Ao entrar em "sem apresentação", o sistema MUST descartar a cor de
  referência, de modo que a primeira leitura após o retorno seja anunciada como
  mudança.
- **FR-012a**: A troca de item MUST NOT descartar a cor de referência nem
  disparar reanúncio de cor. Os dois eventos são independentes: se a cor do novo
  item não ultrapassar o limiar contra a referência, nenhuma mudança de cor é
  anunciada.
- **FR-013**: O sistema MUST permitir que um consumidor dentro do mesmo processo
  se inscreva para receber os eventos, sendo notificado a cada um deles.
- **FR-013a**: O sistema MUST expor, para consulta a qualquer momento, o estado
  corrente: cor de referência, item em exibição, posição do slide dentro do item
  e seu total, tema atual e suas etiquetas, disponibilidade do Holyrics e o
  horário da última leitura bem-sucedida de cada consulta separadamente.
- **FR-013b**: O sistema MUST continuar operando normalmente sem nenhum
  consumidor inscrito — os eventos seguem sendo registrados em log.
- **FR-013c**: Uma falha dentro do consumidor MUST NOT interromper o ciclo de
  leitura nem derrubar o processo; a falha é registrada e o ciclo seguinte
  ocorre normalmente.

**Registro (log)**

- **FR-013d**: O sistema MUST gravar o log em arquivo, de modo que o diagnóstico
  continue possível depois que o serviço for encerrado e o terminal fechado.
- **FR-013e**: O sistema MUST rotacionar o arquivo de log por tamanho, mantendo
  um número limitado de arquivos anteriores, de forma que o uso de disco fique
  limitado mesmo com o serviço rodando por muitas horas seguidas.
- **FR-013f**: O sistema MUST escrever também no terminal quando houver um, sem
  deixar de gravar no arquivo.
- **FR-013g**: Destino do arquivo de log, tamanho de rotação, quantidade de
  arquivos mantidos e nível de verbosidade MUST ser configuráveis.
- **FR-013h**: O sistema MUST distinguir, por nível de verbosidade, o registro de
  cada leitura individual do registro dos eventos — de modo que o log de uso
  normal contenha os eventos sem uma linha por segundo.
- **FR-013i**: Falha ao gravar o log em arquivo (caminho inválido, disco cheio,
  permissão negada) MUST NOT derrubar o serviço nem interromper a leitura.
- **FR-013j**: O sistema MUST registrar em log a troca de tema, para que a
  correspondência entre tema, etiquetas e cor lida possa ser avaliada depois.

**Resiliência**

- **FR-014**: O sistema MUST permanecer em execução quando o Holyrics estiver
  indisponível na inicialização ou ficar indisponível durante a operação.
- **FR-015**: O sistema MUST tentar novamente após falha, com intervalo crescente
  entre tentativas: começa em 1 segundo, dobra a cada falha consecutiva e para de
  crescer ao atingir um teto configurável, cujo padrão é 15 segundos.
- **FR-015a**: O teto entre tentativas MUST ser menor que o tempo prometido pelo
  SC-005 para retomada, com folga para uma leitura completa.
- **FR-015b**: Após uma tentativa bem-sucedida, o intervalo entre tentativas MUST
  voltar ao valor inicial, de modo que uma segunda queda não herde o intervalo
  longo da queda anterior.
- **FR-016**: O sistema MUST registrar as transições de disponibilidade do
  Holyrics (disponível, perdido, recuperado), sem repetir a mesma mensagem a cada
  tentativa enquanto o estado não muda.
- **FR-017**: O sistema MUST distinguir, em log, indisponibilidade do Holyrics de
  credencial recusada.

**Configuração e segredo**

- **FR-018**: Endereço do Holyrics, credencial, intervalo de leitura, região de
  cor, limiar de mudança, número de leituras de confirmação, teto do intervalo
  entre tentativas e os parâmetros de log da FR-013g MUST ser configuráveis, sem
  valores fixos no código.
- **FR-019**: A credencial do Holyrics MUST vir de variável de ambiente ou
  arquivo local ignorado pelo controle de versão, e MUST NOT aparecer em nenhum
  log ou mensagem de erro.
- **FR-020**: O sistema MUST recusar-se a iniciar, com mensagem explícita, quando
  a configuração obrigatória estiver ausente ou inválida.

**Verificação de contrato**

- **FR-021**: O formato real das respostas do Holyrics MUST ser verificado contra
  a ferramenta em execução e registrado no repositório junto ao código que o
  consome; qualquer campo ainda não verificado MUST estar marcado como suposição.

### Key Entities

- **Leitura de cor**: o resultado bruto de uma consulta ao Holyrics sobre o que
  está na tela pública. Contém múltiplas regiões, cada uma com seus componentes
  de cor. É descartável — só interessa até virar cor corrente.
- **Cor de referência**: a última cor anunciada. É contra ela que o limiar é
  aplicado. Existe apenas enquanto há apresentação.
- **Item em exibição**: o que o Holyrics está projetando — identificação, tipo e
  nome. Pode estar ausente, e a ausência é um estado legítimo.
- **Posição no item**: em que ponto do item o operador está, e quantos pontos o
  item tem ao todo. Só faz sentido enquanto há item; nem todo tipo de item a
  possui de forma significativa.
- **Tema**: a aparência aplicada à apresentação, com nome e etiquetas. Nesta
  feature é informação observada e registrada, nunca insumo da decisão de cor.
- **Evento**: uma mudança digna de nota — cor anunciada, item trocado, slide
  avançado ou retrocedido, apresentação iniciada ou encerrada, Holyrics perdido
  ou recuperado. É a saída desta feature.
- **Configuração**: os parâmetros operacionais e a credencial. Lida na
  inicialização.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com uma apresentação de cor visualmente inequívoca em exibição, a
  cor anunciada é reconhecida como correta por um observador olhando o telão em
  10 de 10 temas testados.
- **SC-002**: Uma troca de tema no telão é refletida na cor anunciada em no
  máximo 3 segundos — orçamento que acomoda o intervalo de leitura mais a janela
  de confirmação por permanência nos valores padrão.
- **SC-003**: Com o telão parado numa mesma apresentação por 5 minutos, no máximo
  1 mudança de cor é anunciada.
- **SC-004**: O integrador permanece em execução por um culto inteiro (2 horas)
  sem terminar, incluindo pelo menos um encerramento e uma reabertura do
  Holyrics no período.
- **SC-005**: Após o Holyrics voltar a responder, o reporte de cor é retomado em
  no máximo 30 segundos, sem intervenção manual.
- **SC-006**: A lógica de decisão de cor e de limiar é integralmente exercitável
  sem Holyrics em execução.
- **SC-007**: Nenhuma credencial aparece na saída de log em qualquer cenário,
  incluindo os de erro, tanto no arquivo quanto no terminal.
- **SC-008**: Depois de um culto de 2 horas, o arquivo de log permite reconstruir
  a sequência de eventos — cores anunciadas, trocas de item, avanços de slide e
  transições de disponibilidade do Holyrics — com o serviço já encerrado.
- **SC-010**: Numa música conduzida do início ao fim, o número de eventos de
  slide registrados corresponde ao número de avanços que o operador de fato
  executou, sem eventos extras na entrada e na saída da música.
- **SC-009**: O uso de disco pelo log permanece limitado por um teto conhecido,
  independentemente de quantas horas o serviço ficar em execução.

## Assumptions

- **Escopo ampliado para o nível de slide.** O `CLAUDE.md` listava o controle no
  nível de slide/estrofe como fora de escopo; essa decisão foi revista para que
  uma mesma música possa produzir mais de um gatilho. Esta feature apenas *emite*
  o evento de slide — o que fazer com ele continua sendo decisão da feature de
  saída. O `CLAUDE.md` precisa ser atualizado para não contradizer esta spec.
- **Escopo de saída.** Esta feature não envia nada ao Freestyler e não conhece
  fixtures nem canais DMX. Sua entrega é o sinal de cor estável e o estado
  observável; o consumo desse sinal é feature posterior.
- **Consulta, não notificação.** O Holyrics não avisa quando algo muda — o
  integrador precisa perguntar. Todo o desenho parte de leitura periódica.
- **Intervalo padrão de leitura: 1 segundo.** Rápido o bastante para SC-002 e
  suave o bastante para não pressionar o Holyrics. Configurável.
- **Tempo limite de consulta menor que o intervalo de leitura.** Cada consulta
  tem um teto de espera, e ele precisa ser menor que o intervalo entre ciclos —
  caso contrário os ciclos se atropelariam, contra a FR-004. O valor concreto sai
  da latência medida contra o Holyrics real; até lá, o padrão é um chute
  declarado, como a região e o limiar.
- **Backoff de 1s a 15s, dobrando.** O teto foi escolhido para caber no SC-005
  com folga: no pior caso o Holyrics volta logo depois de uma tentativa falhar, e
  a próxima ocorre 15 segundos depois, sobrando tempo para a leitura completar
  dentro dos 30 segundos prometidos.
- **Confirmação padrão: 2 leituras consecutivas.** O menor valor que já descarta
  flash e transição de slide. Combinado ao intervalo de 1s, o pior caso para
  anunciar uma troca real fica em torno de 3 segundos — é esse o orçamento do
  SC-002. Aumentar N torna o sinal mais calmo e mais lento; a troca é explícita e
  fica em configuração.
- **Limiar padrão de mudança: uma diferença perceptual claramente visível** entre
  a leitura e a referência — acima do ponto em que um observador diria "mudou de
  cor", não apenas "ficou um pouco diferente". O valor numérico concreto de ΔE é
  calibrado durante a implementação contra leituras reais e fica ajustável em
  configuração sem alterar código.
- **Tema é observação, não fonte de cor.** As etiquetas do tema estão no log para
  que a calibração revele se a cor lida basta. Se não bastar, usar as etiquetas
  como fonte alternativa é decisão de outra feature — esta não abre precedência
  entre as duas fontes.
- **Sem apresentação significa sem cor.** Nesse estado a feature não inventa cor
  padrão nem preserva a anterior — apenas reporta o estado. Decidir o que as
  luzes fazem nesse caso é responsabilidade da feature de saída.
- **Uma região de cor por vez.** A leitura devolve várias regiões; esta feature
  consome uma, escolhida em configuração. Combinar regiões (média, subconjunto,
  mais saturada) ou alimentar grupos de fixtures a partir de regiões diferentes
  fica para quando houver caso real.
- **A região certa é achada por calibração, não por dedução.** Qual das regiões
  representa melhor o tema depende do layout do telão desta igreja. A escolha do
  padrão de configuração sai de observação contra o Holyrics real durante a
  implementação, junto da verificação de contrato exigida pela FR-021.
- **Um único consumidor local, dentro do processo.** O integrador roda na mesma
  máquina que o Holyrics; não há rede entre componentes, autenticação forte nem
  múltiplos clientes a considerar. A feature de saída (DMX) será código no mesmo
  serviço, inscrito nos eventos — não um segundo processo.
- **Nenhum contrato de mensagem publicado.** Como não há consumidor externo, esta
  feature não define formato de payload, versionamento nem compatibilidade
  retroativa. Se um dia houver segundo processo, o canal nasce ali.
- **Culto como ambiente-alvo.** Ninguém está olhando o terminal durante a
  operação; o log em arquivo é lido depois, para diagnóstico, e é a única
  interface humana desta feature.
- **Verbosidade padrão registra eventos, não leituras.** A 1 leitura por segundo,
  logar cada ciclo enche o arquivo de ruído. O detalhe por leitura existe para
  calibração e depuração, e fica atrás de um nível mais verboso.
