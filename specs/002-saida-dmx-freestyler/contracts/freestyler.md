# Contrato consumido: Freestyler

**Feature**: 002-saida-dmx-freestyler | **Verificado em**: 2026-07-29

> # ✅ VERIFICADO
>
> **Ambiente**: FreeStyler **4.1.7** em Windows 10 (`192.168.1.26`), porta 3332,
> acessado pela LAN. Instalação real: 15 fixtures, 5 grupos, pares LED RGB nos
> endereços 1, 4, 7 e 10.
>
> Verificado contra hardware: descoberta de grupos e fixtures, seleção de grupo
> com confirmação por leitura de volta, e coloração RGB do grupo selecionado.
>
> **Fonte da tabela de comandos**: `Documentation/Sendmessage and TCPIP.pdf`, que
> acompanha a instalação do FreeStyler. Não está no repositório (é material do
> fabricante); o que interessa dele está resumido abaixo.

---

## Transporte

- Socket **TCP**, porta **3332**. Sem autenticação, sem handshake.
- A porta **3333** se comporta de forma idêntica. Não é canal alternativo.
- Ao conectar, nenhum banner.
- **Heartbeat**: um byte `0xFF` a cada ~1499 ms, incondicional. Não é ACK —
  chega igual com 0, 1 ou 5 comandos enviados. É pulso de vida, e o único sinal
  que denuncia uma mesa travada com o socket ainda aberto.

## Dois protocolos na mesma porta

A biblioteca `freestyler_node_connector` usa **apenas o primeiro**, e é por isso
que uma investigação baseada só nela conclui, erradamente, que não há leitura de
estado.

### `FSOC` — comandar

```
FSOC + código(3 dígitos) + argumento(3 dígitos) [+ argumento opcional(3)]
```

Para comandos de botão, o argumento é `255` (clique) ou `000` (soltar). Para
comandos de fader, é o valor `000`–`255`.

### `FSBC` — consultar

```
FSBC + código(3 dígitos) + 000
```

O FreeStyler **responde**:

```
FSBC + <byte de contagem> + "," + valores separados por vírgula
```

> ### ⚠️ O byte de contagem NÃO é confiável
>
> Medido em 2026-07-29, contando os campos após separar por vírgula e descartar
> o vazio inicial:
>
> | Consulta | Byte | Campos reais |
> |---|---|---|
> | `FSBC008000` grupos | 23 | **24** |
> | `FSBC009000` status | 24 | **25** |
> | `FSBC017000` fixtures | 15 | 15 |
> | `FSBC018000` endereços | 15 | 15 |
>
> Nas duas respostas de grupo ele vem **um a menos** que os campos; nas de
> fixture, bate. Não há explicação observada para a diferença.
>
> **Consequência**: o decodificador MUST separar por vírgula e indexar
> posicionalmente, e MUST NOT usar o byte para fatiar nem para validar tamanho.
> Usá-lo produziria erro de um justamente onde importa — a posição do grupo a
> selecionar.
>
> A indexação posicional está **verificada**: com "03: Par Led" selecionado, o
> índice 2 (base zero, após descartar o campo vazio inicial) é o que vale `1`.

## Consultas verificadas

| Comando | Devolve | Observado nesta instalação |
|---|---|---|
| `FSBC010000` | Versão | `4.1.7` |
| `FSBC008000` | Nomes dos grupos | 24 posições: `01: Mov Chão`, `02: Mov. Teto`, `03: Par Led`, `04: Parede`, `05: mov`, e 19 vazias |
| `FSBC009000` | Status dos grupos | 24 valores 0/1 — qual está ativo |
| `FSBC017000` | Nomes das fixtures | 15 nomes: `Pl 1` … `Chão Bateria` |
| `FSBC018000` | **Endereços das fixtures** | `1,4,7,10,13,21,29,33,92,41,49,52,62,72,82` |
| `FSBC023000` | Fixtures selecionadas | 15 valores 0/1 |
| `FSBC021000` | Master intensity | `72` |

Outras consultas documentadas e não testadas: `001` legendas de cue, `005`
status de cue, `011`–`013` submasters, `014` blackout/freeze, `016` cuelists,
`019`/`020` velocidades, `022` fog/fan.

**A ordem de `FSBC017000` e `FSBC018000` é posicional**: o n-ésimo nome
corresponde ao n-ésimo endereço.

## Comandos verificados

| Comando | Código | Efeito observado |
|---|---|---|
| `FSOC034255` … `FSOC043255` | 34–43 | **Alternar** grupos 1 a 10 |
| `FSOC550255` … `FSOC563255` | 550–563 | **Alternar** grupos 11 a 24 |
| `FSOC130vvv` | 130 | **Vermelho** do grupo selecionado |
| `FSOC131vvv` | 131 | **Verde** |
| `FSOC132vvv` | 132 | **Azul** |

### Sobre o nome dos slots de cor

A tabela chama 130/131/132 de **Cyan / Magenta / Yellow**. A lista de *release*
os chama de **red / green / blue** (códigos 644/645/646), com o mesmo paralelo
para amber (582↔647) e white1/white2 (583/584↔648/649).

São os **mesmos três slots de mistura de cor**, nomeados conforme a fixture:
CMY para subtrativa, RGB para aditiva. **Verificado contra par LED RGB**:
`130` acendeu vermelho, `131` verde, `132` azul, os três juntos deram branco, e
zerados apagaram.

Outros faders semânticos documentados: `138` Intensity, `137` Shutter, `582`
Amber, `583`/`584` White, `128`/`129` Color, `124`–`127` Gobo, `133`/`135`
Pan/Tilt.

### Grupo é toggle, e a seleção é exclusiva

Duas observações que mudam como o comando deve ser usado:

**`Group N` alterna, não seleciona.** Enviado com o grupo já ativo, ele
**desativa**:

```
grupo 3 ativo   ->  FSOC036255  ->  nenhum ativo
nenhum ativo    ->  FSOC036255  ->  grupo 3 ativo
```

Quem enviar o comando "por garantia" antes de cada operação apaga a luz na
metade das vezes. O uso correto é ler o status primeiro e só enviar se o grupo
não estiver ativo.

**A seleção é exclusiva.** Com o grupo 3 ativo, ativar o 4 desativa o 3 — não
somam:

```
nenhum          ->  FSOC036255  ->  grupo 3   (fixtures 1-6)
grupo 3         ->  FSOC037255  ->  grupo 4   (fixtures 7-8)
```

Não é preciso desativar o grupo anterior; ativar o desejado basta.

### O ciclo se autoverifica

Selecionar um grupo e conferir pela própria ferramenta:

```
FSBC009000  ->  ,0,0,0,0,...          nenhum grupo ativo
FSBC023000  ->  ,0,0,0,0,0,0,...      nenhuma fixture selecionada
FSOC036255                            selecionar "03: Par Led"
FSBC009000  ->  ,0,0,1,0,...          grupo 3 ativo
FSBC023000  ->  ,1,1,1,1,1,1,0,...    as 6 fixtures do grupo
```

Isso **restaura parcialmente a confirmação de entrega**: a seleção é
confirmável. O valor de cor continua não sendo — não há consulta que devolva o
DMX corrente de um canal.

## Comando por canal cru — a via da biblioteca

Continua válida, e é a única quando não se quer depender de grupo:

```
FSOC335255              CLR (limpa a linha de comando)
+ dígitos(canal)        cada dígito d -> FSOC(319+d)255
+ FSOC332255            @
+ FSOC333255            DMX
+ dígitos(valor)
+ FSOC337255            ENTER
```

60 a 80 bytes por canal. **Verificado**: acendeu um par LED RGB nos canais 1–3.

Comparado com a via semântica, é de seis a doze vezes mais tráfego e exige
conhecer endereços. O limite de ~100 valores por lote — documentado pelo autor
da biblioteca em "Known Errors" — é problema desta via, não da outra.

## Por que não usamos a biblioteca

`freestyler_node_connector` 1.0.1, sem commit desde 2015-02-08:

| Problema | Efeito |
|---|---|
| `process.on('uncaughtException', … process.exit())` | **Decisivo.** Qualquer exceção não tratada em qualquer parte do serviço derrubaria o processo — contra o Princípio IV |
| `this.port = 3332` fixo | Viola FR-023 |
| Ignora o protocolo `FSBC` | Deixa de fora descoberta, seleção por grupo e confirmação |
| Só emula keypad | A via mais cara das duas |
| Fatiamento comentado | FR-014 seria nosso de qualquer forma |

O protocolo é implementado direto sobre `node:net`. O repositório fica citado
como a fonte que revelou o formato `FSOC`, que é o valor real dele.

## A verificar

| Item | Por quê |
|---|---|
| Se a seleção de grupo persiste entre conexões | Determina se o integrador precisa reselecionar a cada ciclo |
| O que acontece com fixtures fora do grupo | A spec exige que fiquem intocadas (FR-008) |
| Se `One group only` (669) muda o comportamento de seleção | Pode simplificar ou complicar |
| Comportamento ao fechar o FreeStyler no meio | Confirma o desenho de reconexão |
| Se a janela precisa de foco | Emulação de teclas costuma exigir; funcionou, mas nada isolou a variável |
| Taxa sustentada máxima | Quantos comandos por segundo antes de perder |

## Procedimento de verificação

1. `FSBC010000` — deve devolver a versão.
2. `FSBC008000` e `FSBC017000` — nomes de grupos e fixtures conferem com a tela.
3. `FSBC009000`, selecionar um grupo com `FSOC`, `FSBC009000` de novo — o status muda.
4. Com o grupo selecionado, `FSOC130255` — as fixtures ficam vermelhas.
5. Escutar 9 s sem enviar — devem chegar ~6 bytes `0xFF`.
6. Repetir 1 com o FreeStyler fechado — a conexão deve ser recusada.
