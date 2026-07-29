# Phase 0 — Pesquisa e decisões

**Feature**: 002-saida-dmx-freestyler | **Data**: 2026-07-29

Não há nenhum "NEEDS CLARIFICATION" pendente do Technical Context. O que
normalmente seria pesquisa aqui já foi **observação contra a ferramenta real**,
registrada em [contracts/freestyler.md](contracts/freestyler.md). Este documento
registra as decisões e o que foi rejeitado.

---

## 1. Não usar `freestyler_node_connector`

**Decisão**: implementar o protocolo direto sobre `node:net`.

**Rationale**: a biblioteca instala
`process.on('uncaughtException', … process.exit())`. Qualquer exceção não tratada
em qualquer parte do serviço — inclusive em código da 001 — passaria a derrubar o
processo. Isso contraria o Princípio IV de forma não contornável sem monkey
patching. Somam-se: porta 3332 fixa no código (contra FR-023), dependência de `Q`,
fatiamento comentado, e ignorância completa do canal `FSBC`.

**Alternativas rejeitadas**:

- *Usar e isolar atrás de um adaptador*: não resolve os handlers globais, que são
  instalados no `require`.
- *Fork do pacote*: mais trabalho de manutenção que reimplementar 20 linhas.
- *Monkey patch dos handlers*: frágil e obscuro.

O repositório continua sendo citado: foi ele que revelou o formato `FSOC`, que
não está em nenhuma documentação pública.

## 2. Comandar por grupo, não por canal cru

**Decisão**: selecionar um grupo e escrever nos três slots de mistura.

**Rationale**: o Freestyler já conhece o patch. Pedir ao operador que redigite
endereço inicial e offsets num JSON cria uma segunda fonte de verdade que pode
divergir em silêncio da primeira. Além disso, o custo deixa de crescer com o
número de fixtures — quatro comandos, tenha o grupo seis ou sessenta.

**Alternativas rejeitadas**:

- *Canal cru* (`CLR / @ / DMX / ENTER`): verificado e funcional, mas traz de
  volta o endereçamento em arquivo e o limite de ~100 valores por lote.
- *Oferecer as duas vias por configuração*: segunda via para um caso que ainda
  não existe (Princípio V). Fica documentada, não implementada.

## 3. Ler o status antes de alternar o grupo

**Decisão**: consultar o status dos grupos e só enviar o comando se o grupo
seguidor **não** estiver ativo.

**Rationale**: **verificado** — `Group N` é toggle. Enviar "por garantia" antes
de cada aplicação desligaria o grupo em toda aplicação par, e a luz apagaria de
dois em dois. Ler antes torna a operação idempotente.

Verificado também que a seleção é **exclusiva**: ativar um grupo desativa o
anterior. Logo não é preciso desativar nada antes — comandos a mais só aumentam
a superfície de erro num protocolo sem confirmação.

## 4. Heartbeat como sinal de disponibilidade

**Decisão**: ausência de heartbeat por uma janela configurável significa
Freestyler indisponível. Padrão: **6000 ms**; mínimo aceito: **4500 ms**.

**Rationale**: o pulso `0xFF` chega a cada ~1499 ms, incondicionalmente. Um
socket TCP aberto não denuncia mesa travada — os `write` continuam retornando
sucesso para o vazio, possivelmente pelo culto inteiro. O heartbeat é o único
sinal de saúde disponível.

**Corrigido em 2026-07-29 (achado H1 da análise).** A primeira versão desta
decisão punha o mínimo em 3000 ms, alegando cobrir dois batimentos. Dois
batimentos são 2998 ms: a margem contra atraso de escalonamento do event loop
era de **2 ms**, ou seja, nenhuma — um GC mais longo declararia queda falsa. O
mínimo passou a 4500 ms (três batimentos, 4497 ms) e o padrão a 6000 ms
(quatro), que é folga confortável para um sinal cuja perda só importa em
segundos.

**Alternativas rejeitadas**:

- *Só reagir a erro de socket*: não detecta a mesa travada, que é o caso ruim.
- *Ping de aplicação*: não há comando de ping, e mandar comando qualquer para
  testar mexeria em luz.

## 5. Confirmar a seleção antes de aplicar cor

**Decisão**: após enviar o toggle, reler o status e só então escrever a cor.

**Rationale**: é a única confirmação que o protocolo oferece. Cor não é
confirmável (FR-015b); seleção é (FR-015c). Escrever cor sem saber qual grupo
está selecionado é o único jeito de a cor vazar para fixtures erradas.

**Alternativa rejeitada**: *confiar no toggle e seguir*. Custa uma consulta de
~1,5 ms evitar colorir o grupo errado; não há troca a fazer aqui.

## 6. Casamento de nome de grupo tolerante a caixa e espaço

**Decisão**: comparar ignorando maiúsculas/minúsculas e espaços nas pontas.
Acentos contam. Ambiguidade recusa operar.

**Rationale**: o nome é digitado à mão a partir do que se lê na tela. Os dois
enganos mais comuns são caixa e espaço sobrando. Acento é onde a tolerância
começaria a aproximar nomes distintos, e a mensagem de erro já resolve o resto
listando os nomes reais.

**Alternativas rejeitadas**: *literal* (frágil demais para nome digitado);
*normalizar acento* (aproxima nomes distintos); *casar por prefixo numérico*
(depende de convenção de nomenclatura que é do usuário, não da ferramenta).

## 7. Reprocurar o grupo enquanto houver cor a aplicar

**Decisão**: enquanto o grupo não estiver resolvido, tentar de novo a cada cor a
aplicar. Uma vez resolvido, não repetir até a próxima reconexão.

**Rationale**: cobre o caso real de configurar antes do culto — subir, ver no log
que errou o nome, corrigir no Freestyler e esperar que funcione sem reiniciar.
Amarrar à existência de cor a aplicar evita consulta em laço durante um culto
inteiro por causa de um nome errado.

## 8. Não comandar nada até a primeira cor

**Decisão**: o integrador não toca na mesa até receber o primeiro
`cor_anunciada`.

**Rationale**: aplicar cor exige selecionar grupo, e selecionar altera o que o
operador vê. A subida do serviço é justamente quando ele está configurando o
Freestyler. Esta decisão **reverte** a da primeira rodada de clarificação, que
foi tomada quando se supunha escrita direta em canais, invisível.

O custo — fixtures em estado indeterminado até a primeira apresentação — é
mitigado por log explícito (FR-027b), sem o qual "ainda não houve apresentação" e
"integrador quebrado" produzem o mesmo sintoma.

## 9. Não restaurar a seleção anterior

**Decisão**: depois de colorir, o grupo seguidor permanece selecionado.

**Rationale**: restaurar exigiria mais um toggle sobre um estado que pode ter
mudado no intervalo — o integrador devolveria uma seleção já obsoleta. E cada
comando a mais é risco num protocolo em que a cor não é confirmável.

## 10. Reaproveitar o backoff da 001

**Decisão**: `src/core/backoff.ts` serve tal como está — 1 s dobrando até 15 s.

**Rationale**: é função pura já testada, e não há evidência de que o Freestyler
precise de ritmo diferente. Vale também para o reagendamento de envio após falha
(FR-029a).

## 11. Codificação do formato de fio

**Decisão**: `FSOC` + código com 3 dígitos + argumento com 3 dígitos, ambos
preenchidos com zero à esquerda. `FSBC` + código + `000`.

**Rationale**: observado. `FSOC002255` para blackout confirma o zero-padding do
código; `FSOC130255` e `FSOC130000` confirmam o do argumento.

**Cuidado registrado**: códigos de grupo passam de 3 dígitos a partir do grupo 11
(`550`–`563`), o que continua cabendo em 3 casas. Não há grupo cujo código
ultrapasse 999.

---

## O que permanece não observado

Listado em [contracts/freestyler.md](contracts/freestyler.md). Nenhum item é
consumido por esta feature — onde a informação faltaria, o código lê o estado em
vez de supor:

| Item | Por que não bloqueia |
|---|---|
| Se a seleção persiste entre conexões | FR-012a lê o status antes de agir, então tanto faz |
| Finalidade da porta 3333 | Não é usada; 3332 basta |
| Taxa sustentada máxima | Uma aplicação de cor são 4 comandos, e elas são raras |
| Se a janela precisa de foco | Funcionou sem isolar a variável; se falhar em produção, o log de FR-024 mostra que o comando saiu |
