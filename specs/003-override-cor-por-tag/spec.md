# Feature Specification: Override de cor por tag do tema

**Feature Branch**: `003-override-cor-por-tag`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "Crie uma seção no arquivo de configurações para fazer a associação da tag capturada do Holyrics a uma cor. Para casos onde a cor do slide ficar esquisita, podermos selecionar qual cor será assumida."

## Contexto

A cor que chega ao palco hoje é inteiramente calculada: a 001 lê o color map do
Holyrics, extrai a cor da região configurada e a anuncia; a 002 a aplica no grupo
seguidor. Não há como o operador discordar do resultado.

E há resultados discordáveis. A verificação de 2026-07-28 estabeleceu que o color
map do Holyrics é uma **média amostrada** do tema, não a cor predominante dele.
Média produz cinza sempre que o tema tem cores opostas, e produz lavado sempre
que o tema é claro. O sintoma não é defeito — é a média funcionando — mas o palco
fica errado do mesmo jeito, e não existe hoje nenhum caminho para corrigir sem
mexer no tema dentro do Holyrics.

Esta feature abre esse caminho pelo dado que já está sendo lido e descartado: as
**tags do tema**. Elas foram postas no log da 001 exatamente para esta pergunta —
"a cor extraída basta?" — e a resposta, quando é não, precisava de um lugar para
ir.

> **Esta feature emenda duas decisões ratificadas.** A 001 declara que o tema
> nunca influencia a cor anunciada (FR-005b) e a 002 proíbe derivar cor da troca
> de tema (FR-003). As duas foram escritas de propósito, e as duas mudam aqui.
> As emendas estão em [Emendas a features anteriores](#emendas-a-features-anteriores),
> nomeadas uma a uma. Nenhuma é silenciosa.

## Clarifications

### Session 2026-07-31

- Q: Quando o tema porta mais de uma tag mapeada, qual vence? → A: A primeira que
  casar na **ordem de declaração da configuração** (FR-007). O operador controla
  a precedência num lugar só, editando o arquivo — e pode declarar o específico
  antes do genérico sabendo qual manda. A ordem das tags dentro do Holyrics é
  invisível na tela e ninguém a escolhe conscientemente.
- Q: A cor mapeada espera a confirmação por permanência da 001? → A: Sim, igual a
  qualquer outra cor (FR-012). Um caminho só no núcleo. O custo é o atraso que já
  existe hoje e que ninguém reclamou; a alternativa era carregar para sempre a
  exceção "cor declarada não precisa de confirmação".
- Q: Com a leitura de cor falhando — erro na consulta ou região inexistente — e o
  tema portando tag mapeada, a cor declarada segue para o palco? → A: Sim
  (FR-008a). O override não depende da extração, e o FR-004a da 001 já estabelece
  que a falha de uma consulta não invalida as outras. A consulta que decide aqui é
  a do tema, e ela funcionou; reter a cor por causa de uma consulta irrelevante
  deixaria a luz errada sem motivo.
- Q: A comparação deve tratar como iguais duas formas Unicode do mesmo texto
  acentuado? → A: Sim, normalizando os dois lados para NFC antes de comparar
  (FR-006a). Medido: `café` com e-agudo em um code point e `café` com acento
  combinante são visualmente idênticos, `===` diz que não, e a normalização
  resolve. Não afrouxa FR-006 — `ceu` continua não casando com `céu`.
- Q: Sem apresentação no ar, o último tema mapeado mantém o override? → A: Não
  (FR-014a). Sem apresentação não há tema, e o repouso da 002 continua mandando.
  Fica escrito porque FR-008a torna essa fronteira fácil de atravessar por engano:
  as duas condições são vizinhas no mesmo trecho. Falha na **consulta de item** é
  caso distinto e já resolvido — ali não se sabe que não há apresentação, então a
  cor segue sendo avaliada e o override vale.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - O operador fixa a cor de um tema que sai errado (Priority: P1)

Uma música tem tema de fundo com foto clara e letras escuras. A cor extraída sai
num cinza esverdeado que não lembra nada do que está no telão, e o palco fica
sujo. O operador marca aquele tema no Holyrics com uma tag — `azul`, digamos —,
declara no arquivo de configuração que `azul` vale `(0, 40, 200)`, e a partir daí
aquele tema, e qualquer outro que ele marque igual, acende azul no palco. A cor
extraída daquele tema deixa de importar.

**Why this priority**: é a feature inteira. Sem isto, o operador não tem voz sobre
a cor, e a única correção disponível é editar o tema dentro do Holyrics — mexendo
no que a congregação vê para consertar o que ela não vê.

**Independent Test**: com um mapeamento declarado e um tema portando a tag,
verificar que a cor anunciada é a declarada e não a extraída — sem Holyrics no ar,
alimentando leitura e tema diretamente, porque a substituição é decisão pura.

**Acceptance Scenarios**:

1. **Given** a tag `azul` mapeada para uma cor e o tema em exibição portando essa
   tag, **When** uma leitura de cor acontece, **Then** a cor que segue para o
   palco é a declarada, independentemente do que a extração calculou.
2. **Given** o mesmo mapeamento, **When** entra um tema **sem** nenhuma tag
   mapeada, **Then** a cor extraída volta a valer, sem resíduo do override
   anterior.
3. **Given** nenhum mapeamento declarado na configuração, **When** o serviço
   opera, **Then** o comportamento é idêntico ao de antes desta feature, em todos
   os aspectos.
4. **Given** um tema com tag mapeada, **When** o conteúdo do telão muda dentro do
   mesmo tema, **Then** a cor permanece a declarada — o override é do tema, não
   do slide.

---

### User Story 2 - O override vale mesmo quando a extração não mudaria nada (Priority: P1)

O operador troca de uma música com tema escuro para outra com tema escuro, e
mapeou a segunda para vermelho. As duas extraem quase a mesma cor, então o
mecanismo anti-flicker da 001 concluiria, corretamente, que não há mudança a
anunciar. Ainda assim o palco fica vermelho, porque quem mudou foi o tema.

**Why this priority**: é P1 junto com a US1, e não abaixo dela, porque é o caso
que motiva a feature. Um tema cuja cor extraída sai **igual** à do anterior é
precisamente o tema que ninguém consegue distinguir no palco — e é para ele que o
operador vai querer fixar cor. Um override que só funcionasse quando a cor já ia
mudar sozinha resolveria o problema apenas onde ele não existe.

**Independent Test**: alimentar duas leituras consecutivas com a mesma cor
extraída e temas diferentes, o segundo com tag mapeada, e verificar que a cor
declarada é anunciada.

**Acceptance Scenarios**:

1. **Given** a cor extraída estável e imutável entre duas leituras, **When** o
   tema troca para um com tag mapeada, **Then** a cor declarada é anunciada.
2. **Given** um tema com tag mapeada em exibição, **When** o tema troca para
   outro **sem** tag mapeada e a cor extraída não mudou desde antes do override,
   **Then** a cor extraída é anunciada — sair do override é tão observável quanto
   entrar nele.
3. **Given** dois temas mapeados para a **mesma** cor, **When** um sucede o
   outro, **Then** nenhum comando novo chega às fixtures, porque a cor resultante
   não mudou.

---

### User Story 3 - O operador entende de onde veio a cor (Priority: P2)

A luz está numa cor que o operador não esperava. Ele precisa saber, olhando o
log, se aquilo veio da extração ou de um mapeamento — e, se veio de mapeamento,
de qual tag. Sem isso, um override esquecido no arquivo vira um fantasma: a cor
não obedece o telão e nada explica por quê.

**Why this priority**: não muda o que acontece no palco, mas esta feature
introduz uma segunda fonte de cor, e duas fontes sem rastro é o começo de um
diagnóstico impossível. Fica abaixo das duas primeiras porque o comportamento
correto ainda é observável a olho nu.

**Independent Test**: aplicar uma cor por override e conferir que o registro
nomeia a tag responsável e preserva a cor extraída que foi descartada.

**Acceptance Scenarios**:

1. **Given** uma cor vinda de mapeamento, **When** ela é anunciada, **Then** o
   registro diz que a origem é a tag, qual tag foi, e qual cor a extração havia
   calculado.
2. **Given** uma cor vinda da extração normal, **When** ela é anunciada, **Then**
   o registro a identifica como extraída, sem menção a tag.
3. **Given** o serviço subindo, **When** a configuração é lida, **Then** o log
   registra quantos mapeamentos foram carregados e quais tags eles cobrem.
4. **Given** um tema portando uma tag que **não** está mapeada, **When** ele
   entra, **Then** a tag aparece no log como não mapeada — é assim que o operador
   descobre que digitou a tag diferente no Holyrics e na configuração.

---

### Edge Cases

- **Tema com várias tags mapeadas.** Vence a primeira declarada na configuração,
  e o log nomeia as preteridas (FR-007, FR-007b).
- **Tag composta só de dígitos**, como `2024`. Precedência continua sendo a
  ordem declarada (FR-007a) — é o caso que expõe formatos que reordenam chaves
  sem avisar.
- **Tema sem tag alguma.** Extração normal. Não é caso especial.
- **Tag mapeada para preto.** É cor legítima, como já é na 002 (FR-026b de lá).
  Vale como qualquer outra: o palco apaga porque o operador pediu.
- **Seção de mapeamento ausente ou vazia.** Feature desligada, comportamento
  idêntico ao anterior. Nunca é erro.
- **Duas chaves do mapeamento que casam entre si** sob a regra de comparação (por
  exemplo `"Azul"` e `" azul "`). É erro de configuração, recusado na subida —
  não dá para escolher uma delas em silêncio.
- **Sem apresentação em exibição.** Não há tema, logo não há override (FR-014a).
  O repouso da 002 continua valendo sem alteração. É o único lugar onde a dispensa
  de FR-008a **não** vale.
- **Holyrics perdido.** Nada muda: a cor corrente permanece, override ou não.
- **Leitura de cor falhando com tema mapeado.** A cor declarada vale assim mesmo
  (FR-008a). É o caso em que o override é mais útil, não menos: a extração é
  justamente o que não está disponível.
- **Tema trocado sem que o Holyrics reporte tags.** Equivale a tema sem tag.

## Requirements *(mandatory)*

### Functional Requirements

#### Configuração do mapeamento

- **FR-001**: A configuração MUST aceitar uma seção nova que associe **tags do
  tema** a **cores fixas** em componentes r/g/b de 0 a 255, no mesmo arquivo já
  usado pela 001 e pela 002. MUST NOT haver segundo arquivo, variável de ambiente
  nova nem flag de linha de comando.
- **FR-002**: A seção MUST ser opcional. Ausente ou vazia, o sistema MUST se
  comportar exatamente como antes desta feature — a extração é a única fonte de
  cor, e nenhum caminho novo é exercitado.
- **FR-003**: Preto MUST ser cor mapeada válida.
- **FR-004**: Se duas chaves do mapeamento casarem entre si sob a regra de
  FR-006, o sistema MUST recusar a subida e nomear as chaves conflitantes.
  Escolher uma em silêncio produziria cor estável e inexplicável.

#### Casamento da tag

- **FR-005**: O sistema MUST comparar as tags do tema em exibição contra as
  chaves declaradas, e MUST tratar o tema como **mapeado** quando ao menos uma
  casar.
- **FR-006**: A comparação MUST ignorar diferença de maiúsculas e minúsculas e
  espaços nas pontas. Acentos **contam**.
  > Mesma regra que a 002 já usa para nome de grupo (FR-009b de lá), pelo mesmo
  > motivo e com o mesmo limite: a tag é digitada à mão em dois lugares
  > diferentes, e tolerar caixa e espaço mata os dois enganos mais comuns sem
  > começar a aproximar nomes distintos.
- **FR-006a**: Antes de comparar, ambos os lados MUST ser normalizados para a
  mesma forma Unicode (NFC). Duas grafias do mesmo texto acentuado MUST casar.
  > Não é afrouxamento de FR-006, é o que o torna cumprível. `café` com o e-agudo
  > em um code point e `café` com acento combinante são o mesmo texto na tela e
  > strings diferentes na memória — e a tag é digitada em dois programas
  > distintos, que podem gravar de formas distintas. Sem normalizar, o override
  > falha e nem o log de tag não mapeada denuncia: ele mostraria as duas grafias
  > lado a lado, idênticas aos olhos. `ceu` continua não casando com `céu`.
- **FR-007**: Quando o tema portar mais de uma tag mapeada, MUST vencer a
  **primeira que casar na ordem de declaração da configuração**. A ordem das tags
  dentro do tema MUST NOT influenciar o resultado.
  > A precedência fica num lugar só, sob controle de quem edita o arquivo:
  > declarar `azul-escuro` antes de `azul` basta para o específico ganhar do
  > genérico. A ordem das tags no Holyrics não serviria — ela não aparece na tela
  > e ninguém a escolhe de propósito.
- **FR-007a**: O formato da seção MUST preservar a ordem em que o operador
  declarou os mapeamentos, para qualquer tag que ele possa escrever — inclusive
  tags compostas só de dígitos.
  > Consequência direta de FR-007, e não é detalhe de implementação: se a ordem
  > declarada não sobreviver à leitura, a regra de precedência deixa de valer sem
  > que nada falhe. Uma tag como `2024` é o caso concreto — em alguns formatos ela
  > salta para a frente das demais, invertendo a precedência em silêncio.
- **FR-007b**: Havendo mais de uma tag mapeada no mesmo tema, o sistema MUST
  registrar em log que houve empate, qual tag venceu e quais foram preteridas.

#### Substituição da cor

- **FR-008**: Quando o tema em exibição estiver mapeado, a cor declarada MUST
  substituir a cor extraída, **sempre**, sem condição sobre a cor extraída ser
  boa, ruim, próxima ou distante.
- **FR-008a**: A substituição MUST acontecer mesmo quando a leitura de cor
  falhar ou a região configurada não existir. A ausência de cor extraída MUST NOT
  suprimir o override.
  > É o FR-004a da 001 aplicado aqui: a falha de uma consulta não invalida as
  > outras. A consulta que decide o override é a do tema, e reter a cor declarada
  > porque uma consulta irrelevante falhou deixaria a luz errada sem motivo.
  > Consequência aceita: nos ciclos sem leitura válida, o registro da cor extraída
  > exigido por FR-009 fica vazio. Vazio é informação — diz que a extração falhou
  > naquele ciclo, e não que ela coincidiu com a declarada.
- **FR-009**: A cor extraída MUST continuar sendo lida e registrada mesmo com o
  override ativo, **quando houver leitura válida** (FR-008a). É o que permite ao
  operador avaliar depois se ainda precisa do override.
- **FR-010**: A troca para um tema mapeado MUST produzir a cor declarada no palco
  **ainda que a cor extraída não tenha mudado**. A ausência de mudança na
  extração MUST NOT suprimir o override.
  > É o requisito central desta spec. A 001 só anuncia cor quando a mudança
  > ultrapassa o limiar perceptual (FR-012a de lá), e dois temas escuros
  > sucessivos extraem cores parecidas por construção. Um override que dependesse
  > do anúncio da extração falharia exatamente no caso que motivou a feature.
- **FR-011**: A saída de um tema mapeado para um não mapeado MUST devolver a cor
  extraída ao palco, sob a mesma regra: a ausência de mudança na extração MUST
  NOT prender a cor no override anterior.
- **FR-012**: A cor mapeada MUST atravessar **as mesmas barreiras** que qualquer
  outra cor antes de chegar às fixtures — limiar de mudança, confirmação por
  permanência e supressão de envio redundante. O sistema MUST NOT abrir exceção
  para a origem da cor em nenhuma dessas etapas.
  > A cor declarada não tem ruído a filtrar, então a confirmação não a protege de
  > nada. O que se compra com ela é um caminho só no núcleo: nada de "esta cor
  > pula a fila", nada de dois conjuntos de teste, nada de exceção para explicar
  > daqui a um ano. O preço é o atraso que já existe hoje para qualquer troca de
  > cor, e do qual ninguém reclamou.
- **FR-013**: O override MUST ser do **tema**, não do item nem do slide. Enquanto
  o tema permanecer, a cor declarada permanece, qualquer que seja o conteúdo em
  exibição.
- **FR-014**: O sistema MUST NOT alterar o comportamento de repouso da 002. Sem
  apresentação não há tema, logo não há override.
- **FR-014a**: A dispensa de leitura de cor concedida por FR-008a MUST NOT se
  estender à ausência de apresentação. Sabendo-se que não há apresentação, nenhuma
  cor MUST ser anunciada, mapeada ou não.
  > As duas condições são vizinhas, e é por isso que esta linha existe: quem
  > afrouxar uma tende a afrouxar a outra junto. Afrouxar esta acenderia a luz
  > exatamente no momento em que a 002 decidiu, de propósito, não comandar nada
  > (FR-027 de lá).
  > **Falhar a consulta de item é caso distinto**, e nele o override vale: não se
  > sabe que não há apresentação, então a cor continua sendo avaliada como em
  > qualquer outro ciclo (FR-004a da 001).

#### Observabilidade

- **FR-015**: Toda cor anunciada MUST trazer no registro a sua **origem**:
  extraída ou vinda de mapeamento. Com origem em mapeamento, MUST nomear a tag
  responsável e preservar a cor extraída que foi descartada.
- **FR-016**: Na subida, o sistema MUST registrar quantos mapeamentos foram
  carregados e quais tags eles cobrem.
- **FR-017**: Quando um tema portar tags e **nenhuma** delas estiver mapeada, o
  sistema MUST registrar as tags observadas.
  > É o diagnóstico de tag digitada diferente nos dois lados, que sem isso tem o
  > mesmo sintoma de override nenhum: a cor simplesmente não obedece.

### Key Entities

- **Mapeamento de tag**: associação declarada pelo operador entre uma tag do tema
  e uma cor fixa. Vive na configuração, não tem estado, e é lido uma vez na
  subida. É uma sequência **ordenada**, não um conjunto: a ordem é a regra de
  precedência (FR-007).
- **Cor efetiva**: a cor que segue para o palco depois de resolvida a origem. É a
  cor mapeada quando o tema está mapeado, e a extraída caso contrário. É ela, e
  não mais a extraída, que alimenta a decisão de anúncio.
- **Origem da cor**: qual dos dois caminhos produziu a cor efetiva e — no caso de
  mapeamento — qual tag respondeu. Existe para o log; não altera comportamento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com um tema mapeado em exibição, a cor no palco é a declarada na
  configuração, e o valor extraído do Holyrics não tem efeito observável algum.
- **SC-002**: Trocando entre dois temas cujas cores extraídas são
  indistinguíveis, sendo o segundo mapeado, o palco muda de cor em até 3
  segundos — o mesmo prazo que qualquer outra troca de cor leva hoje, porque o
  override não pula nenhuma barreira (FR-012).
- **SC-003**: Removido o mapeamento da configuração, o comportamento observado é
  igual ao anterior a esta feature — mesma cor, mesmos tempos, mesmo volume de
  comandos.
- **SC-004**: A partir do log de uma única cor anunciada, é possível dizer se ela
  veio da extração ou de uma tag, e qual tag foi, sem consultar o código nem a
  configuração.
- **SC-005**: Uma tag digitada diferente no Holyrics e na configuração é
  identificável pelo log em até uma troca de tema, sem depurar.
- **SC-006**: Uma sessão inteira com o mesmo tema mapeado em exibição não produz
  comando novo às fixtures após a aplicação inicial.
- **SC-007**: Configurar um override exige do operador **apenas** uma tag que ele
  já usa no Holyrics e três números de 0 a 255.

## Emendas a features anteriores

Esta feature não pode existir sem mudar duas decisões já ratificadas. Ambas as
emendas são deliberadas e ficam registradas aqui para que as specs originais
sejam corrigidas junto da implementação, não depois.

| Requisito | Texto vigente | Emenda |
|---|---|---|
| **001 / FR-005b** | O tema é informativo e **nunca** influencia a cor anunciada | Passa a influenciar quando, e somente quando, uma de suas tags estiver mapeada na configuração. Sem mapeamento, o texto original continua valendo palavra por palavra |
| **002 / FR-003** | MUST NOT derivar cor de `tema_trocado` nem de `item_trocado` | A parte sobre `item_trocado` permanece intacta. A parte sobre `tema_trocado` cede: a troca de tema passa a poder mudar a cor efetiva, pela via do mapeamento |

O motivo de as duas terem sido escritas como estavam continua válido: cor
derivada de tema **por conta própria** seria adivinhação. O que muda é que agora
existe uma declaração explícita do operador dizendo qual cor aquele tema deve
ter. A decisão saiu do sistema e foi para o arquivo.

## Assumptions

- **A tag é o identificador certo, e não o nome nem o id do tema.** Tag é o único
  dos três que agrupa: o operador marca cinco temas com `azul` e resolve os cinco
  de uma vez. Nome e id resolveriam um por vez, e o nome ainda quebraria ao ser
  editado.
- **A substituição é lógica pura** — recebe cor extraída, tags e mapeamento, e
  devolve cor efetiva e origem. Sem I/O, sem relógio, sem log dentro
  (Princípio II), e nasce de teste que falha primeiro (Princípio III).
- **O dado necessário já é lido.** O tema em exibição, com suas tags, já é
  consultado a cada ciclo pela 001 e já vai para o log. Esta feature não
  acrescenta consulta ao Holyrics nem muda o intervalo de leitura.
- **Um mapeamento, uma cor.** Tag para cor sólida, ponto. Nada de faixa,
  gradiente, condição por horário, ou cor por combinação de tags — o segundo caso
  real ainda não apareceu (Princípio V).
- **O operador controla as tags.** Elas são criadas por ele no Holyrics, e a
  configuração é digitada à mão a partir do que ele leu lá. É a mesma dependência
  de nome externo que a 002 aceitou para o nome do grupo, tratada do mesmo jeito:
  detecção e log acionável em vez de garantia impossível.
- **A 002 não muda.** Ela consome a cor anunciada e não pergunta de onde veio. O
  grupo seguidor, o repouso, o heartbeat e a reconexão ficam como estão.
- **Não há migração.** Configuração sem a seção nova continua válida e se comporta
  como hoje (FR-002).

## Out of Scope

- Interface para editar o mapeamento. Ele vive no arquivo, como todo o resto.
- Recarregar a configuração sem reiniciar o serviço.
- Override por nome do tema, por id do tema, por item ou por slide.
- Modificar a cor extraída em vez de substituí-la — realce, saturação, correção
  de gama. Substituir é substituir.
- Efeito, transição, chase ou cena disparada por tag. Cor sólida, como manda o
  escopo do projeto.
- Validar a cor mapeada contra o que as luminárias conseguem exibir.
