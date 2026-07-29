# Contrato consumido: Freestyler

**Feature**: 002-saida-dmx-freestyler | **Verificado em**: 2026-07-28

> # ✅ VERIFICADO
>
> **Ambiente**: Freestyler em Windows 10 (`192.168.1.26`), porta 3332, acessado
> pela LAN. Fixture de teste: um par LED RGB nos canais 1, 2 e 3 do universo 1
> (1 = vermelho, 2 = verde, 3 = azul).
>
> **A fixture respondeu corretamente** a comandos individuais e em lote, com
> cliente próprio — sem a biblioteca `freestyler_node_connector`. O formato de
> fio abaixo está confirmado contra hardware, não deduzido.

---

## Transporte

- Socket **TCP**, porta **3332**. Sem autenticação, sem handshake.
- A porta **3333** também aceita conexão. **Finalidade desconhecida** — não foi
  investigada.
- Ao conectar, o servidor **não envia banner**. Fica calado até o primeiro
  heartbeat.

## Formato de fio

Não é DMX. São sequências ASCII que **emulam teclas** do Freestyler.

| Token | Significado |
|---|---|
| `FSOC335255` | CHAN (inicia a seleção de canal) |
| `FSOC332255` | `@` |
| `FSOC333255` | DMX |
| `FSOC337255` | ENTER |
| `FSOC002255` | alterna blackout |
| `FSOC{319+d}255` | o dígito decimal `d` |

Os dígitos são codificados um a um: `0` → `FSOC319255`, `1` → `FSOC320255`, …,
`9` → `FSOC328255`. O número 255 vira três tokens.

**Comando de canal**:

```
FSOC335255 + digitos(canal) + FSOC332255 + FSOC333255 + digitos(valor) + FSOC337255
```

Tamanho observado: **60 a 80 bytes por comando**, conforme a quantidade de
dígitos. Três canais num único `write` deram 220–240 bytes.

Fonte primária do formato: [FreestylerNodeConnector](https://github.com/jschyma/FreestylerNodeConnector),
lido como especificação. Ver "Por que não usamos a biblioteca" abaixo.

## Heartbeat — o achado mais útil

O servidor envia **um byte `0xFF` a cada ~1499 ms**, indefinidamente.

Testado em quatro condições — sem enviar nada, com 1 comando, com 5 comandos em
rajada, e com 5 comandos num único `write`. **Nas quatro: exatamente 6 bytes em
9 segundos, nos mesmos intervalos.**

**Não é ACK.** É pulso de vida, independente do tráfego.

Isso importa porque TCP sozinho não denuncia um Freestyler travado: o socket
segue aberto e os `write` seguem "funcionando" para o vazio. O heartbeat dá um
sinal de saúde com resolução de ~1,5 s, e é provavelmente o detector de
disponibilidade mais confiável disponível.

## Não há confirmação de entrega

Nenhuma resposta acompanha um comando. Testados e **todos silenciosos**:

| Enviado | Resposta |
|---|---|
| Comando válido | nenhuma (só o heartbeat, no ritmo dele) |
| Mesmo comando repetido | nenhuma |
| Canal inexistente (999) | nenhuma |
| Lixo puro (`LIXOQUENAOEXISTE`) | nenhuma |

O Freestyler **não reclama de entrada inválida**. Consequência direta para a
spec: "entregue com sucesso" não é observável. O máximo que o integrador sabe é
"escrito no socket sem o TCP reclamar" — ver FR-015a e FR-029.

## Carga

| Medida | Observado |
|---|---|
| Latência de `write` | 0,04 a 0,43 ms |
| Backpressure | **Nenhum.** `socket.write` devolveu `true` sempre |
| Maior lote testado | 1400 bytes, 20 comandos concatenados — aceito sem engasgo |

**O limite de ~100 valores por lote não foi reproduzido nem refutado.** Ele vem
de um comentário no código da biblioteca (`// exactly 100 seem to much`), cujo
trecho de fatiamento está **desabilitado**. O maior teste aqui foi de 20
comandos. Tratar o limite como real continua sendo a decisão prudente (FR-014),
mas é herança de comentário alheio, não observação nossa.

## Por que não usamos a biblioteca

`freestyler_node_connector` 1.0.1 é idêntica ao repositório no GitHub (só muda
CRLF) e **não recebe commit desde 2015-02-08**. São 87 linhas com quatro
problemas:

| Problema | Efeito |
|---|---|
| `this.port = 3332` fixo | Viola FR-023 e a Restrição Técnica de host/porta configuráveis |
| Fatiamento comentado | `setDMXFromArray` despeja tudo num `write`; FR-014 teria de ser nosso de qualquer forma |
| Dependência de `Q` | Biblioteca de promises obsoleta, desnecessária desde o Node 8 |
| `process.on('uncaughtException', … process.exit())` | **Decisivo.** Qualquer exceção não tratada em qualquer parte do serviço passaria a derrubar o processo — o oposto do Princípio IV |

O último item, sozinho, elimina a opção: importar a lib é entregar a um pacote
abandonado o poder de matar um serviço que precisa sobreviver ao culto.

**Decisão**: implementar o protocolo direto sobre `node:net`. São ~20 linhas, e
o repositório fica citado como fonte do formato — o mesmo papel que a
documentação do Holyrics teve na 001.

## A verificar

| Item | Por quê |
|---|---|
| Finalidade da porta 3333 | Pode haver canal melhor que emulação de teclas |
| O limite real por lote | Nosso teste foi 20 comandos; o "~100" é de terceiros |
| Taxa sustentada máxima | Quantos comandos por segundo antes de perder |
| Comportamento ao fechar o Freestyler no meio | Confirma o desenho de reconexão (FR-018 a FR-021) |
| Se a janela precisa de foco | Emulação de teclas costuma exigir; o teste funcionou, mas nada isolou a variável |
| Se `toggleBlackout` interfere | Não usamos, mas o operador pode acionar pela mesa |

## Procedimento de verificação

1. Conectar em `{host}:3332` e escutar 9 s sem enviar — devem chegar ~6 bytes `0xFF`.
2. Enviar um comando de canal e confirmar a fixture fisicamente.
3. Enviar os três canais num único `write` e confirmar.
4. Enviar lixo e confirmar que não há resposta nem efeito.
5. Repetir 1 com o Freestyler fechado — a conexão deve ser recusada.
