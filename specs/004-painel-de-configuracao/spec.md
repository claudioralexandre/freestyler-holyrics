# Feature Specification: Painel de configuração

**Feature Branch**: `004-painel-de-configuracao`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "Adicione também uma interface visível simples para ajuste das configurações e criação da associação das tags com as cores."

## Contexto

Até aqui o integrador não tem rosto. Toda a configuração vive num arquivo JSON
editado à mão, e todo diagnóstico sai pelo log. Foi decisão consciente, repetida
em três documentos, e funcionou enquanto quem configurava era quem escrevia o
código.

A feature 003 muda esse equilíbrio. Mapear uma tag para uma cor exige saber
**quais tags o tema em exibição carrega** — informação que hoje só existe no log,
misturada a tudo o mais, enquanto o culto acontece. O operador teria que abrir o
arquivo de log, achar a linha do tema, copiar a tag, abrir o JSON, digitar a cor,
salvar, reiniciar o serviço e esperar. Na prática ninguém faz isso durante um
culto — e é durante o culto que se descobre que a cor está errada.

Esta feature dá rosto ao integrador: uma página aberta no navegador que mostra o
que está acontecendo agora e deixa ajustar a configuração sem parar nada.

> **Esta feature reverte três decisões de escopo.** Elas estão nomeadas em
> [Reversões de escopo](#reversões-de-escopo), com o texto original de cada uma.
> Nenhuma cai por esquecimento.

## Clarifications

### Session 2026-07-31

- Q: O que abrir a página para a rede deve exigir? → A: Nada além de declarar
  (FR-003). É LAN doméstica de igreja, e o Freestyler já escuta na mesma rede sem
  autenticação alguma. O risco está aceito e nomeado em
  [Riscos aceitos](#riscos-aceitos), não escondido.
- Q: A página vem ligada ou desligada por padrão? → A: **Ligada** (FR-004).
  "Interface visível" não pode depender de o operador descobrir, no arquivo que a
  página existe para ele não abrir, que precisa ligá-la.
- Q: Então o padrão também é escutar na rede? → A: **Não** (FR-003a). Não foi
  perguntado, e as duas respostas acima juntas obrigam a decisão: com a página
  ligada por padrão, escutar na rede por padrão exporia edição de configuração em
  toda instalação, inclusive nas de quem nunca quis a página. Abrir continua sendo
  ato deliberado — apenas sem senha.
- Q: Edição do arquivo à mão, com o serviço rodando, deve valer sozinha? → A:
  **Não** (FR-023a). Só submissão aceita pela página recarrega a quente; edição à
  mão vale na próxima subida, como hoje. Observar o arquivo custaria debounce,
  tratamento de gravação parcial de terceiros e um caminho novo para configuração
  inválida alcançar serviço em execução — nada disso foi pedido (Princípio V). Em
  troca, a página MUST mostrar quando o disco divergir do que está em execução.
- Q: Com o arquivo mudado por fora, que saídas o operador tem ao salvar? → A:
  **Duas, e nenhuma funde** (FR-026a): sobrescrever assim mesmo, ou descartar as
  edições da página e recarregar do disco. Fusão campo a campo traria de volta o
  "aplicar parte de uma submissão" que a FR-012 proíbe, e é abstração para um caso
  que ainda não apareceu (Princípio V).
- Q: Qual campo é a exceção da FR-021, que zera a máquina de estado da cor? → A:
  **Só `leitura.regiao`** (FR-021a). É o único que troca a procedência da cor: a
  referência guardada veio de outra região da tela, e o ΔE seguinte compararia
  grandezas diferentes. Limiar e ciclos só mudam a régua, e `coresPorTag` já entra
  na máquina como cor efetiva por desenho da 003 — nesses três, sobreviver é o
  comportamento correto.
- Q: E quando o operador muda, pela página, o endereço em que a própria página
  escuta? → A: **Ela se re-serve no endereço novo** (FR-018a), com aviso antes de
  aplicar; se o endereço novo não puder ser aberto, a alteração é recusada e o
  antigo continua servindo. Mantém FR-010 e SC-002 sem exceção, e evita que um
  erro de digitação deixe o operador sem página até o próximo reinício (FR-004a).
- Q: E o nível de log editado pela página, com `LOG_LEVEL` definida no ambiente? →
  A: **O ambiente continua vencendo, mas às claras** (FR-016a). A precedência faz
  parte da validação que a FR-011 manda reaproveitar; fazer a página vencer daria
  duas regras conforme o caminho usado. O defeito a corrigir não é a precedência —
  é ela ser invisível.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mapear uma tag olhando para o que está no ar (Priority: P1)

O louvor começa e a segunda música acende o palco num cinza sujo. O operador abre
a página, vê ali que o tema em exibição se chama "Cana Verde" e carrega as tags
`lento` e `verde`, e vê lado a lado a cor que foi extraída e a que está valendo.
Ele associa `verde` a um verde de verdade, salva, e o palco muda antes do refrão.
Não parou o serviço, não abriu o log, não editou JSON.

**Why this priority**: é a razão de a feature existir. Sem a página, o mapeamento
da 003 depende de garimpar tags no log e reiniciar o serviço — o que significa,
na prática, que a correção só acontece depois do culto, quando o problema já
passou.

**Independent Test**: com o serviço no ar e um tema em exibição, conferir que a
página mostra as tags desse tema e que criar um mapeamento por ela muda a cor
efetiva sem reinício.

**Acceptance Scenarios**:

1. **Given** um tema em exibição com tags, **When** o operador abre a página,
   **Then** ele vê o nome do tema, suas tags, a cor extraída e a cor que está
   valendo, com a origem de cada uma.
2. **Given** a página aberta, **When** o operador cria um mapeamento para uma tag
   do tema atual e salva, **Then** a cor mapeada passa a valer sem reinício do
   serviço.
3. **Given** um mapeamento existente, **When** o operador o remove e salva,
   **Then** a cor extraída volta a valer, também sem reinício.
4. **Given** vários mapeamentos declarados, **When** o operador os reordena,
   **Then** a nova ordem passa a decidir a precedência entre tags concorrentes.
5. **Given** o tema em exibição muda enquanto a página está aberta, **When** o
   novo tema entra, **Then** a página passa a mostrar as tags do novo tema sem
   que o operador recarregue nada.

---

### User Story 2 - Ajustar qualquer campo sem derrubar o culto (Priority: P1)

O grupo do Freestyler foi renomeado, ou o limiar está deixando passar mudança que
ninguém percebe, ou o Holyrics mudou de porta. O operador corrige pela página. O
serviço não reinicia, não perde a conexão que não precisava perder, e volta a
operar com o valor novo no ciclo seguinte.

**Why this priority**: é P1 junto com a US1 porque foi decisão explícita que
**todos** os campos sejam editáveis e que a mudança valha na hora. Uma página que
edita tudo mas exige reinício entrega menos que o editor de texto que ela
substitui — lá, ao menos, não há falsa promessa.

**Independent Test**: alterar, um a um, campos de categorias diferentes — um
parâmetro de decisão, um endereço de conexão, um destino de log — e verificar que
cada um passa a valer sem reinício e com o efeito colateral correto.

**Acceptance Scenarios**:

1. **Given** o serviço operando, **When** o operador muda um parâmetro que só a
   decisão de cor usa, **Then** o valor novo vale no ciclo seguinte e nenhuma
   conexão é refeita.
2. **Given** o serviço conectado ao Freestyler, **When** o operador muda o
   endereço ou a porta dele, **Then** a conexão antiga é encerrada e a nova é
   estabelecida, com a transição registrada em log.
3. **Given** o serviço operando, **When** o operador muda o nome do grupo
   seguidor, **Then** o nome novo é resolvido contra a mesa e o resultado —
   achado ou não — aparece na página e no log.
4. **Given** o serviço operando, **When** o operador muda o intervalo de leitura,
   **Then** o ritmo passa a ser o novo sem que nenhuma leitura em curso seja
   abandonada pela metade.
5. **Given** o serviço operando sem `LOG_LEVEL` no ambiente, **When** o operador
   muda o nível ou o destino do log, **Then** os registros seguintes obedecem ao
   valor novo.
6. **Given** o serviço operando **com** `LOG_LEVEL` no ambiente, **When** o
   operador muda o nível do log, **Then** o valor é gravado e a página mostra que
   o ambiente está sobrepondo o campo, sem prometer efeito que não haverá.

---

### User Story 3 - Uma configuração ruim não derruba nada (Priority: P1)

O operador digita `700` num componente de cor, ou apaga o nome do grupo, ou põe
um caminho de log onde não dá para escrever. A página recusa e diz o que está
errado. O serviço continua rodando com a configuração que estava valendo, e o
culto não percebe nada.

**Why this priority**: é P1 porque a alternativa é catastrófica na proporção
inversa à sua probabilidade. O Princípio IV não é negociável, e esta feature abre
um caminho novo para configuração inválida chegar a um serviço em execução —
caminho que antes exigia editar o arquivo e reiniciar de propósito.

**Independent Test**: submeter valores inválidos de categorias diferentes e
verificar, a cada um, que a recusa é explicada, que o arquivo não foi tocado e
que a configuração em execução não mudou.

**Acceptance Scenarios**:

1. **Given** o serviço operando, **When** o operador submete um valor inválido,
   **Then** a alteração é recusada com a explicação do que está errado, o arquivo
   permanece como estava e a configuração em execução não muda.
2. **Given** uma submissão recusada, **When** o operador corrige e submete de
   novo, **Then** ela é aceita normalmente.
3. **Given** o serviço operando, **When** a gravação do arquivo falha por
   qualquer motivo, **Then** o operador é avisado de que não foi salvo, e a
   configuração em execução continua sendo a anterior — nunca uma mistura.
4. **Given** a máquina desliga durante a gravação, **When** o serviço sobe de
   novo, **Then** ele encontra um arquivo íntegro: ou o antigo por inteiro, ou o
   novo por inteiro.

---

### User Story 4 - O arquivo continua sendo a verdade (Priority: P2)

Quem prefere o editor de texto continua editando o arquivo. A página não é um
banco de dados paralelo: ela lê e escreve o mesmo arquivo, preserva o que não
exibe, e avisa quando o arquivo mudou por fora em vez de sobrescrever o que outra
pessoa acabou de fazer.

**Why this priority**: a decisão de arquivo único já está ratificada (002/FR-022),
e quebrá-la criaria duas fontes de verdade para divergirem em silêncio —
exatamente o defeito que a 002 evitou ao recusar duplicar o patch do Freestyler.
Fica em P2 porque só se manifesta quando os dois caminhos são usados juntos.

**Independent Test**: editar o arquivo à mão com a página aberta e verificar que a
página não sobrescreve a edição sem avisar.

**Acceptance Scenarios**:

1. **Given** a página aberta, **When** o arquivo é alterado por fora e o operador
   tenta salvar, **Then** a página avisa que o arquivo mudou e oferece duas
   saídas — sobrescrever por inteiro ou descartar as edições e recarregar do
   disco —, sem sobrescrever antes de ele escolher.
2. **Given** um arquivo com campos que a página não exibe, **When** o operador
   salva pela página, **Then** esses campos permanecem no arquivo inalterados.
3. **Given** o arquivo editado à mão de forma válida, **When** o operador
   recarrega a página, **Then** ela mostra os valores novos do arquivo e sinaliza
   que eles ainda não estão em execução.
4. **Given** o arquivo editado à mão com o serviço rodando, **When** nenhuma
   submissão é feita pela página, **Then** o serviço continua operando com a
   configuração anterior até a próxima subida.

---

### Edge Cases

- **Serviço fora do ar.** A página não existe: ela é servida pelo próprio
  integrador. É consequência aceita da forma escolhida, não defeito.
- **Porta da página já ocupada por outro programa.** O serviço MUST seguir
  operando sem a página, registrando o motivo — luz é a função principal, painel
  é conveniência (Princípio IV).
- **Configuração inválida no arquivo na subida.** Comportamento inalterado em
  relação a hoje — o serviço recusa subir, e sem serviço não há página.
- **Duas abas editando ao mesmo tempo.** Mesma regra do arquivo alterado por
  fora: quem salvar por último é avisado de que a base mudou.
- **Arquivo editado à mão com o serviço rodando.** Não recarrega sozinho
  (FR-023a). A página mostra o valor do disco e sinaliza que ele ainda não vale;
  quem quiser aplicá-lo submete pela página ou reinicia.
- **Mapeamento removido enquanto o tema que o usava está no ar.** A cor extraída
  volta a valer no ciclo seguinte, como qualquer saída de override (003/FR-011).
- **Campo alterado para o mesmo valor.** Não produz efeito colateral algum — nada
  de reconexão gratuita.
- **Endereço da própria página alterado pela própria página.** A aba aberta perde
  a conexão de propósito, avisada de antemão, e o operador vai para o endereço
  novo (FR-018a). Endereço novo que não sobe é recusa, não perda da página.
- **Endereço de conexão alterado para destino inexistente.** A conexão cai e entra
  em reconexão com backoff, exatamente como quando a ferramenta fecha. O serviço
  não morre (Princípio IV).
- **Tema sem tags.** A página diz que não há tag a mapear, em vez de mostrar campo
  vazio sem explicação.
- **Mapeamento apontando para tag que nenhum tema usa.** É legítimo — o operador
  pode preparar antes do culto. A página o mostra como não exercitado.

## Requirements *(mandatory)*

### Functional Requirements

#### Acesso à interface

- **FR-001**: O integrador MUST servir uma página de configuração aberta em
  navegador, sem exigir instalação de programa adicional na máquina do culto.
- **FR-002**: O endereço de escuta da página MUST ser configurável, nunca fixo no
  código — mesma regra que já vale para Holyrics e Freestyler (002/FR-023).
- **FR-003**: A configuração MUST permitir abrir a página para outras máquinas da
  rede local, e essa abertura MUST NOT exigir senha, cadastro ou qualquer outro
  mecanismo de autenticação.
  > É LAN de igreja, e o Freestyler já escuta na mesma rede sem autenticação
  > nenhuma. Acrescentar senha só aqui protegeria a porta menos interessante da
  > casa. O risco está aceito e nomeado em [Riscos aceitos](#riscos-aceitos).
- **FR-003a**: O padrão MUST ser escutar **apenas na própria máquina**. Abrir para
  a rede MUST ser ato deliberado do operador, declarado na configuração.
  > Consequência de FR-003 e FR-004 juntos, e não de um pedido: com a página
  > ligada por padrão, escutar na rede por padrão exporia edição de configuração
  > em toda instalação — inclusive nas de quem nunca quis a página.
- **FR-003b**: Quando estiver escutando para além da própria máquina, o sistema
  MUST registrar isso em log na subida, em nível de aviso, dizendo em que
  endereço está exposto.
  > Sem autenticação, o log é a única coisa que separa "eu abri" de "abriu
  > sozinho e ninguém viu".
- **FR-004**: A página MUST vir **ligada** por padrão. Desligá-la MUST ser
  possível pela configuração, e MUST ser ato explícito.
  > A alternativa era a convenção da 002, onde a presença do bloco liga a feature.
  > Ela perde aqui por um motivo circular: o operador descobriria que a página
  > existe abrindo o arquivo que a página existe para ele não precisar abrir.

- **FR-004a**: Falha ao disponibilizar a página — porta ocupada, endereço
  inválido, qualquer motivo — MUST NOT impedir o serviço de subir nem de operar.
  O motivo MUST ir para o log, e a luz continua sendo comandada normalmente.
  > Vira requisito porque FR-004 liga a página por padrão: a partir daí, uma porta
  > ocupada por outro programa passa a ser um caminho novo para o integrador não
  > subir — exatamente o que o Princípio IV proíbe.

#### O que a página mostra

- **FR-005**: A página MUST mostrar o estado corrente do integrador: item e tema
  em exibição, **tags do tema**, cor extraída, cor efetiva, origem da cor efetiva,
  e disponibilidade de Holyrics e Freestyler.
- **FR-006**: As tags do tema em exibição MUST ser apresentadas de forma que o
  operador possa criar um mapeamento a partir delas **sem redigitar o texto**.
  > É o requisito que separa esta página de um editor de JSON com validação. A tag
  > é digitada em dois lugares e a 003 exige casamento sensível a acento (FR-006
  > de lá): redigitar é o erro mais provável do fluxo inteiro, e ele é silencioso.
- **FR-007**: O estado exibido MUST acompanhar a operação sem que o operador
  recarregue a página, refletindo mudança de tema ou de cor em até o dobro do
  intervalo de leitura configurado.
- **FR-008**: A página MUST distinguir visualmente a cor extraída da cor efetiva
  quando um override estiver ativo, e nomear a tag responsável.
- **FR-009**: A página MUST indicar quando o grupo seguidor configurado não foi
  resolvido contra o Freestyler, listando os grupos que existem (002/FR-010).

#### Edição e validação

- **FR-010**: A página MUST permitir editar **todos** os campos da configuração:
  conexão, decisão de cor, saída DMX, log e mapeamento de tags.
- **FR-011**: Toda submissão MUST passar pela **mesma validação** que a
  configuração lida do arquivo, sem regra própria da interface. Uma configuração
  aceita pela página MUST ser aceita na subida seguinte, e vice-versa.
- **FR-012**: Submissão inválida MUST ser recusada por inteiro, identificando o
  campo e o problema. O sistema MUST NOT aplicar parte de uma submissão.
- **FR-013**: Uma submissão recusada MUST NOT alterar o arquivo nem a configuração
  em execução. O serviço MUST continuar operando com o que já valia.
- **FR-014**: O mapeamento de tags MUST ser editável como sequência **ordenada** —
  criar, remover e reordenar —, porque a ordem é a regra de precedência
  (003/FR-007).
- **FR-015**: A página MUST NOT exibir, editar ou ecoar o token do Holyrics. Ele
  não vive na configuração e MUST continuar não vivendo.
- **FR-016**: Mensagens de erro MUST identificar o campo pelo caminho e MUST NOT
  ecoar o valor recebido — mesma regra do formatador já usado na validação.

- **FR-016a**: Quando uma variável de ambiente sobrepuser um campo da configuração
  — hoje `LOG_LEVEL` sobre o nível de log —, o campo MUST continuar editável e a
  submissão MUST ser gravada normalmente, mas a página MUST mostrar que o ambiente
  está sobrepondo aquele campo e que o valor salvo só passa a valer quando a
  variável sair. A página MUST NOT inverter essa precedência.
  > A precedência do ambiente faz parte da validação que a FR-011 manda
  > reaproveitar; inverter só neste caminho daria duas regras conforme quem editou.
  > Sem o aviso, porém, o operador salvaria, a página confirmaria o sucesso e o log
  > seguiria igual — sem nenhuma pista do porquê.

#### Recarga a quente

- **FR-017**: Uma alteração aceita MUST passar a valer sem reinício do processo.
- **FR-018**: A recarga MUST tratar cada campo conforme o que ele afeta, e MUST
  NOT produzir efeito colateral em componente que não depende do campo alterado:
  parâmetros de decisão passam a valer no ciclo seguinte; o ritmo de leitura muda
  sem abandonar leitura em curso; endereços de conexão exigem refazer aquela
  conexão e somente aquela; o nome do grupo seguidor exige nova resolução contra a
  mesa; destino e nível de log passam a valer nos registros seguintes.
- **FR-018a**: Alterar o endereço de escuta da própria página MUST fazer o serviço
  passar a servi-la no endereço novo e encerrar o antigo, sem reinício do
  processo. A página MUST avisar, antes de aplicar, que a aba aberta perderá a
  conexão e em que endereço ela volta. Se o endereço novo não puder ser aberto, a
  alteração MUST ser recusada por inteiro e o antigo MUST continuar servindo.
  > É o único campo cuja alteração derruba o canal por onde ela foi feita. Sem a
  > recusa com preservação do antigo, um erro de digitação deixaria o operador sem
  > página até o próximo reinício — o mesmo desamparo que a FR-004a proíbe na
  > subida.
- **FR-019**: Alterar um campo para o **mesmo valor** MUST NOT produzir efeito
  colateral algum — nenhuma reconexão, nenhuma reresolução, nenhum comando de luz.
- **FR-020**: A recarga MUST NOT interromper um envio ao Freestyler já em curso.
  Vale a mesma serialização que a 002 exige (FR-016 de lá).
- **FR-021**: A recarga MUST NOT reiniciar a máquina de estado da cor: a cor de
  referência, a candidata e a contagem de confirmação sobrevivem à troca de
  configuração. A única exceção é a FR-021a.
- **FR-021a**: Alterar `leitura.regiao` MUST zerar a máquina de estado da cor —
  referência, candidata e contagem —, de modo que a leitura seguinte seja adotada
  e anunciada de imediato, como num arranque (001/FR-009a). Nenhum outro campo
  MUST zerá-la, inclusive `cor.limiarDeltaE`, `cor.ciclosDeConfirmacao` e
  `coresPorTag`.
  > É o único campo que troca a **procedência** da cor. A referência guardada foi
  > extraída de outra região da tela; mantê-la faria o ΔE seguinte comparar duas
  > grandezas diferentes e decidir errado nos dois sentidos — anunciar mudança que
  > não houve, ou engolir a que houve. Os outros três só mudam a régua ou a
  > entrada, que a máquina já sabe tratar.
- **FR-022**: Toda recarga aceita MUST ser registrada em log, nomeando quais
  campos mudaram — nunca o arquivo inteiro.

#### O arquivo como fonte da verdade

- **FR-023**: A página MUST ler e escrever o **mesmo arquivo** já usado pelas
  features anteriores. MUST NOT haver segundo arquivo, banco de dados ou estado
  paralelo (002/FR-022).
- **FR-023a**: A recarga a quente MUST ser disparada **somente** por submissão
  aceita pela página. Alteração feita no arquivo por fora MUST NOT alterar a
  configuração em execução; ela vale na subida seguinte, como antes desta feature.
  Enquanto o disco divergir do que está em execução, a página MUST sinalizar a
  divergência.
  > Sem o sinal, o operador leria no formulário um valor que a cor efetiva ao lado
  > não está usando — a mesma divergência silenciosa que a FR-023 existe para
  > evitar. Com ele, o arquivo segue sendo a verdade sem que o serviço precise
  > observá-lo (Princípio V).
- **FR-024**: A gravação MUST ser atômica: uma interrupção a qualquer momento MUST
  deixar no disco o conteúdo antigo íntegro ou o novo íntegro, nunca um
  meio-termo.
  > O serviço não sobe com configuração corrompida. Um arquivo pela metade
  > transforma um ajuste de cor num culto sem integrador.
- **FR-025**: A gravação MUST preservar campos do arquivo que a página não exibe.
- **FR-026**: Se o arquivo tiver mudado por fora desde que a página o carregou, o
  sistema MUST avisar e MUST NOT sobrescrever sem decisão explícita do operador.
- **FR-026a**: Diante desse aviso, o operador MUST ter exatamente duas saídas:
  **sobrescrever** com o conteúdo da página por inteiro, ou **descartar** as
  edições da página e recarregar o que está no disco. O sistema MUST NOT fundir os
  dois conteúdos, campo a campo ou de qualquer outra forma.
  > Fundir seria compor uma configuração que ninguém escreveu, e reintroduziria
  > pela porta dos fundos o "aplicar parte de uma submissão" proibido pela FR-012.
  > As duas saídas cobrem os dois donos legítimos do conflito, e nenhuma delas
  > descarta trabalho sem que o operador tenha mandado.
- **FR-027**: Falha de gravação MUST ser reportada ao operador e MUST NOT alterar
  a configuração em execução.

### Key Entities

- **Configuração em execução**: o conjunto de valores que o serviço está usando
  agora. Só muda por recarga aceita.
- **Configuração submetida**: o que a página mandou. Vira configuração em execução
  apenas se passar inteira pela validação.
- **Estado observável**: o retrato do que o integrador vê agora — item, tema,
  tags, cor extraída, cor efetiva, origem, disponibilidade das duas ferramentas.
  É leitura; a página não o altera.
- **Mapeamento de tags**: a sequência ordenada da 003, editável pela página. Ordem
  é significado, não apresentação.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com um tema em exibição, o operador cria um mapeamento para uma de
  suas tags e vê a cor mudar no palco em menos de 30 segundos, sem sair da página
  e sem reiniciar o serviço.
- **SC-002**: Nenhum ajuste feito pela página exige reinício do processo, para
  nenhum campo da configuração.
- **SC-003**: Submeter configuração inválida deixa o serviço operando e o arquivo
  intacto em 100% das tentativas, e a mensagem nomeia o campo pelo caminho e o
  problema, de modo que a correção seguinte seja aceita **sem sair da página**.
- **SC-004**: O operador identifica as tags do tema em exibição pela página, sem
  abrir o arquivo de log, em qualquer momento do culto.
- **SC-005**: Uma configuração salva pela página é aceita na subida seguinte do
  serviço, sempre — a página nunca produz arquivo que o serviço recuse.
- **SC-006**: Interromper a máquina durante a gravação nunca deixa o serviço
  incapaz de subir por configuração corrompida.
- **SC-007**: Alterar um campo que não envolve conexão não produz nenhuma
  reconexão, verificável pelo log.
- **SC-008**: O token do Holyrics não aparece em nenhuma tela nem em nenhuma
  resposta da página.
- **SC-009**: Instalando a versão nova sem tocar no arquivo de configuração, a
  página existe e responde na própria máquina — e **não** responde a partir de
  outra máquina da rede.
- **SC-010**: Com a página aberta para a rede, o log da subida diz em que endereço
  ela está exposta, e a linha é encontrável sem filtro.

## Reversões de escopo

Três decisões registradas caem aqui. As três eram da mesma família —
"configuração é arquivo, diagnóstico é log" — e sustentaram o projeto até a 003
introduzir um dado que só é útil enquanto o culto acontece.

| Onde | Texto que cai | O que passa a valer |
|---|---|---|
| `CLAUDE.md`, *Fora de escopo (por enquanto)* | "Interface web ou qualquer UI. O mapeamento vive em arquivo de configuração." | O mapeamento continua vivendo no arquivo. O que muda é que ele deixa de ser o **único** caminho até lá |
| `specs/002`, *Out of Scope* | "Interface web ou qualquer UI. A configuração vive em arquivo." | Idem. A 002 não muda de comportamento: ela usa a configuração que valer, e agora ela pode mudar em execução |
| `specs/003`, *Out of Scope* | "Interface para editar o mapeamento" e "Recarregar a configuração sem reiniciar o serviço" | As duas caem, e a segunda é a de maior consequência — ver abaixo |

**A recarga a quente é a reversão cara.** As outras duas acrescentam um caminho;
esta muda uma premissa que atravessa o código inteiro: até aqui, configuração era
constante durante a vida do processo. Todo componente que guardou um valor de
configuração na subida passa a estar errado. É por isso que existem FR-018 a
FR-021, em vez de um único "recarregar a configuração".

## Riscos aceitos

- **Página aberta na rede não tem dono.** Escolhido em 2026-07-31, de olhos
  abertos: quem alcança a máquina pela rede local pode editar toda a configuração
  do integrador e, com isso, mudar a cor do palco ou parar a saída de luz. Não é
  descuido de especificação — é o mesmo nível de exposição que o Freestyler já
  aceita na mesma rede, e a alternativa custava um mecanismo de senha que não
  existe em nenhum outro ponto do projeto.
  - Mitigações que ficam no lugar: escuta restrita à própria máquina por padrão
    (FR-003a), aviso em log quando exposta (FR-003b), token do Holyrics fora da
    configuração e fora da tela (FR-015), e nenhum comando de luz alcançável pela
    página (Out of Scope).
  - O que reabre a decisão: a página passar a expor segredo, o integrador passar a
    rodar em rede compartilhada com terceiros, ou a máquina do culto passar a ter
    acesso à internet de entrada.
- **O risco não é o mesmo do token da 001.** Lá, o segredo viaja em claro na query
  string e a ressalva de `CLAUDE.md` continua valendo por conta própria. Aqui não
  há segredo em trânsito — há autoridade sem prova de identidade.

## Assumptions

- **A página é borda fina** (Princípio II). Ela traduz formato e apresenta; não
  decide cor, não fala com o Freestyler, não implementa validação própria. A
  validação de configuração já existe como lógica pura testada e é reaproveitada
  (FR-011).
- **O estado observável já existe.** A 001 expõe um retrato consultável com item,
  tema, tags, cor de referência e disponibilidade. Esta feature o apresenta; não
  cria fonte de dado nova nem consulta o Holyrics por conta própria.
- **Nada de comandar luz pela página.** Nem testar cor, nem acender fixture, nem
  disparar cena. A página edita configuração e mostra estado; quem comanda luz é a
  002, pelo caminho dela. Isso mantém intacta a garantia de que nenhuma fixture
  fora do grupo seguidor recebe comando (002/FR-008).
- **Sem segunda linguagem.** A constitution fixa Node.js com TypeScript e proíbe
  introduzir outra. A página é servida pelo próprio processo.
- **O operador é um só.** Não há papéis, permissões nem histórico de quem mudou o
  quê. É um serviço pessoal rodando numa máquina de igreja (Princípio V).
- **Conflito é raro, mas não impossível.** Editar o arquivo à mão com a página
  aberta é caso legítimo e tratado (FR-026), não proibido.
- **A 003 é pré-requisito.** Esta feature edita o mapeamento que a 003 define. Sem
  a 003 no lugar, a US1 não tem objeto — o resto da página funcionaria, mas a
  razão de ela existir, não.

## Out of Scope

- Comandar luz pela página: testar cor, acender fixture, blackout, cena, chase.
- Editar o token do Holyrics, ou qualquer segredo, pela interface.
- Autenticação de usuários, papéis, permissões, registro de quem alterou o quê.
- Histórico de versões da configuração, desfazer, restaurar valor anterior.
- Editar tema, tag ou qualquer coisa **dentro** do Holyrics. A página lê o que ele
  reporta; quem cria tag é o operador, lá.
- Gráficos, métricas históricas, painel de tendência. O estado exibido é o de
  agora.
- Acesso pela internet, túnel, nuvem ou qualquer coisa além da rede local.
- Instalador, ícone, inicialização automática com o Windows.
