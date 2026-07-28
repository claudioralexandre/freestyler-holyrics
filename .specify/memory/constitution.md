<!--
Sync Impact Report
==================
Version change: TEMPLATE (não versionada) → 1.0.0
Bump rationale: MAJOR inicial — primeira ratificação. O arquivo saiu do estado
de template com placeholders para um conjunto concreto de princípios de
governança.

Princípios definidos (nenhum renomeado; não havia versão anterior):
  - I.   Contratos Externos São Verificados, Nunca Presumidos
  - II.  Núcleo Puro, Bordas Finas
  - III. Test-First no Núcleo (NÃO-NEGOCIÁVEL)
  - IV.  Degradar Sem Cair
  - V.   Simplicidade Build-to-Learn (YAGNI)

Seções adicionadas:
  - Restrições Técnicas
  - Fluxo de Desenvolvimento
  - Governança

Seções removidas: nenhuma (o template foi preenchido, não reduzido).

Follow-up TODOs: nenhum. Todos os placeholders foram substituídos por valores
concretos.
-->

# Constitution do freestyler-holyrics

Este documento governa o desenvolvimento do integrador que faz a iluminação DMX
acompanhar a cor da apresentação exibida pelo Holyrics.

## Core Principles

### I. Contratos Externos São Verificados, Nunca Presumidos

O projeto depende de duas ferramentas de terceiros — Holyrics API Server e
Freestyler — cujas documentações são incompletas. Toda suposição sobre formato de
requisição, formato de resposta ou comportamento MUST ser confirmada contra a
ferramenta real antes de virar código de produção, e o formato observado MUST ser
registrado no repositório junto ao código que o consome.

É proibido implementar em cima de um contrato que só existe na documentação ou na
memória do agente. Quando a verificação não for possível no momento, o código
MUST marcar explicitamente a suposição como não verificada.

**Rationale:** o retorno exato de `GetColorMap` e o comportamento do socket do
Freestyler sob carga são os dois pontos de maior incerteza do projeto. Errar o
contrato aqui não gera erro de compilação — gera luz na cor errada durante o
culto, que é quando ninguém pode depurar.

### II. Núcleo Puro, Bordas Finas

A lógica de decisão — extrair cor, decidir se a mudança é significativa, mapear
cor para canais DMX, resolver quais fixtures seguem a cor — MUST ser função pura,
sem I/O, sem relógio, sem estado global.

Os adaptadores (cliente HTTP do Holyrics, cliente TCP do Freestyler, leitura de
config) MUST ser finos: traduzem formato e nada mais. Nenhuma regra de negócio
vive dentro de um adaptador.

O núcleo MUST ser executável e verificável sem Holyrics rodando, sem Freestyler
rodando e sem nenhuma fixture ligada.

**Rationale:** é o que permite desenvolver longe do PC do culto, e é o que torna
o Princípio III viável.

### III. Test-First no Núcleo (NÃO-NEGOCIÁVEL)

Todo comportamento do núcleo definido no Princípio II MUST nascer de um teste que
falha primeiro. Ciclo Red-Green-Refactor, sem exceção — inclui a lógica de
limiar anti-flicker, o mapeamento cor→DMX e a resolução de fixtures.

Nos adaptadores de I/O, teste automatizado é OPCIONAL; verificação manual contra
a ferramenta real é suficiente e MUST ser registrada conforme o Princípio I.

**Rationale:** a lógica de cor é o coração do projeto e a parte mais difícil de
inspecionar a olho nu — uma cor sutilmente errada não parece um bug. Sem teste,
ela vira caixa-preta que ninguém ousa ajustar. Já os adaptadores falham de forma
ruidosa e óbvia, onde o custo de fake não se paga.

### IV. Degradar Sem Cair

O serviço MUST tolerar Holyrics ausente, Freestyler ausente, ou ambos — na
inicialização e a qualquer momento durante a execução. Nenhuma dessas condições
pode derrubar o processo.

Perda de conexão MUST disparar reconexão automática com backoff. O serviço MUST
registrar em log a transição de estado (conectado, perdido, reconectado) de cada
dependência.

**Rationale:** o serviço roda durante o culto, sem ninguém olhando o terminal. Um
processo morto é pior que um processo que insiste — se ele cai às 19h, a luz fica
parada pelo resto da noite.

### V. Simplicidade Build-to-Learn (YAGNI)

Este é um projeto de aprendizado, não um produto. Abstração especulativa MUST ser
recusada: nada de camada de plugin para outros softwares de projeção, nada de
suporte a protocolo de iluminação que não seja o Freestyler, nada de configuração
para caso que ainda não existe.

Quando houver dúvida entre a solução direta e a solução extensível, escolha a
direta. Generalize somente quando o segundo caso real aparecer.

**Rationale:** o objetivo declarado é aprender o fluxo de trabalho e o domínio.
Abstração prematura é a forma mais eficiente de transformar um projeto pequeno em
um projeto abandonado.

## Restrições Técnicas

- **Stack:** Node.js com TypeScript. Não introduzir segunda linguagem.
- **Topologia:** Holyrics, Freestyler e o integrador rodam no mesmo PC Windows,
  comunicando por `localhost`. Ainda assim, hosts e portas MUST ser configuráveis,
  nunca fixos no código.
- **Limite do Freestyler:** o conector não aceita mais de ~100 valores por lote, e
  o protocolo emula teclas em vez de falar DMX de verdade. Envios em massa MUST
  ser fatiados e o socket não pode ser saturado.
- **Anti-flicker:** o integrador MUST aplicar limiar de mudança mínima antes de
  enviar DMX. Repassar toda variação de leitura para as luzes é proibido.
- **Escopo das fixtures:** somente as fixtures declaradas na configuração como
  seguidoras de cor podem ser alteradas. As demais MUST permanecer intocadas.
- **Segredos:** o token do Holyrics MUST vir de variável de ambiente ou arquivo
  local ignorado pelo git. Nunca commitado, nunca em log.

## Fluxo de Desenvolvimento

O projeto é conduzido por Spec Kit. Nenhuma feature começa por código.

```
/speckit-constitution → /speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement
```

- Antes de implementar, MUST existir spec correspondente em `specs/`.
- `CLAUDE.md` na raiz é a orientação de runtime para agentes trabalhando no
  repositório e MUST ser mantido coerente com esta constitution.
- Quando spec e constitution divergirem, a constitution prevalece e a spec MUST
  ser corrigida.

## Governança

Esta constitution prevalece sobre qualquer outra prática ou preferência adotada no
projeto, incluindo instruções em `CLAUDE.md` e conteúdo de specs.

**Emendas:** alterações MUST ser feitas neste arquivo, com o Sync Impact Report no
topo atualizado, e commitadas em mudança dedicada — nunca junto de código de
feature.

**Versionamento:** semântico.
- MAJOR — remoção ou redefinição incompatível de princípio ou regra de governança.
- MINOR — novo princípio ou seção, ou expansão material de orientação existente.
- PATCH — esclarecimento, correção de redação, refinamento sem efeito semântico.

**Conformidade:** toda spec, plano e revisão MUST verificar aderência aos
princípios acima. Violação de princípio é permitida apenas quando justificada
explicitamente por escrito na spec que a introduz — complexidade não justificada
MUST ser recusada na revisão.

**Version**: 1.0.0 | **Ratified**: 2026-07-28 | **Last Amended**: 2026-07-28
