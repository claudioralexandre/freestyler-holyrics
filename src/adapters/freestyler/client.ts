/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ ✅ CONTRATO VERIFICADO — FreeStyler 4.1.7, 2026-07-29                      │
 * │                                                                           │
 * │ Socket TCP na porta 3332, sem autenticação e sem handshake. O servidor    │
 * │ fica calado até o primeiro heartbeat.                                     │
 * │                                                                           │
 * │ Contrato: specs/002-saida-dmx-freestyler/contracts/freestyler.md          │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Adaptador fino: abre socket, escreve string, correlaciona resposta. Nenhuma
 * regra de negócio mora aqui.
 *
 * **Nada de handler global.** A biblioteca da comunidade registra
 * `process.on('uncaughtException', … process.exit())`, o que daria a ela o poder
 * de derrubar o serviço durante o culto. É o oposto do Princípio IV, e foi o
 * motivo principal de não usá-la.
 */

import net from 'node:net';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Resultado } from '../../core/state.ts';
import {
  consulta,
  decodificarResposta,
  ehHeartbeat,
  type RespostaDecodificada,
} from './protocolo.ts';

export interface OpçõesDoCliente {
  readonly host: string;
  readonly port: number;
  /** Tempo máximo esperando a resposta de uma consulta. */
  readonly timeoutDeConsultaMs?: number;
  /** Chamado a cada pulso `0xFF`. Alimenta a detecção de disponibilidade. */
  readonly aoPulso?: () => void;
  /** Chamado quando o socket cai, por qualquer razão. */
  readonly aoCair?: () => void;
  /**
   * Avisos da captura temporária do stream — início e teto atingido.
   *
   * Opcional: sem ele a captura funciona igual, só não aparece no log.
   */
  readonly aoCapturar?: (mensagem: string) => void;
}

interface Pendente {
  readonly resolver: (r: Resultado<RespostaDecodificada>) => void;
  readonly temporizador: NodeJS.Timeout;
}

export interface ClienteFreestyler {
  conectar(): Promise<Resultado<void>>;
  enviar(texto: string): Resultado<void>;
  consultar(codigo: number): Promise<Resultado<RespostaDecodificada>>;
  conectado(): boolean;
  fechar(): void;
}

/**
 * Captura do stream cru do Freestyler. **Temporária, e ligada por padrão.**
 *
 * ## Por que existe
 *
 * Em 2026-07-31 o inventário veio corrompido: quatro respostas chegaram num
 * único evento `data` de 281 bytes, e `decodificarResposta` — que trata cada
 * evento como um quadro inteiro — partiu tudo por vírgula. O último nome de
 * grupo saiu grudado no cabeçalho do quadro seguinte.
 *
 * Isso não é cosmético: a mesma leitura posicional decide **qual grupo
 * selecionar**. Um índice errado colore fixtures fora do grupo seguidor, contra
 * a garantia central da 002.
 *
 * ## O que ela ainda precisa responder
 *
 * A captura curta respondeu que o byte de contagem não serve para enquadrar
 * (erra por um no `statusDeGrupos`) e que não há terminador. Ficaram duas
 * perguntas que só um uso longo responde, e são elas que decidem o conserto:
 *
 * 1. **Uma resposta chega partida em dois eventos?** É a falha oposta e pior:
 *    dessincroniza a fila e entrega resposta à consulta errada. Se acontecer,
 *    serializar as consultas não basta — precisa de buffer com enquadramento.
 * 2. **O pulso chega grudado numa resposta?** Se sim, `ehHeartbeat` perde o
 *    pulso **e** corrompe o quadro, porque só reconhece evento de 1 byte.
 *
 * Por isso ela é **ligada por padrão**: as duas só aparecem sob uso real, e o
 * PC do culto é a máquina que quase nunca está disponível.
 *
 * ## Como desligar, e o teto
 *
 * `FREESTYLER_CAPTURA=off` desliga; qualquer outro valor é o caminho do arquivo.
 * O padrão fica ao lado do log do integrador.
 *
 * O teto de tamanho não é zelo: sem ele, um defeito que produzisse tráfego em
 * laço encheria o disco **durante o culto**, e o integrador morreria pela
 * ferramenta de diagnóstico. Ao bater o teto ela para de escrever e avisa uma
 * vez — nunca derruba nada (Princípio IV).
 *
 * **Sai junto com o conserto do enquadramento.**
 */
const CAPTURA_TETO_BYTES = 20 * 1024 * 1024;

let capturaEscritos = 0;
let capturaDesistiu = false;
let capturaAnunciou = false;

function caminhoDaCaptura(): string | null {
  const configurado = process.env['FREESTYLER_CAPTURA'];
  if (configurado === 'off' || configurado === '') return null;
  return configurado ?? './logs/freestyler-captura.log';
}

function capturar(dados: Buffer, avisar?: (mensagem: string) => void): void {
  if (capturaDesistiu) return;

  const arquivo = caminhoDaCaptura();
  if (arquivo === null) return;

  // Uma linha por evento: carimbo, tamanho e os bytes em hexadecimal. O carimbo
  // importa tanto quanto os bytes — dois quadros no mesmo milissegundo dizem
  // "chegaram juntos", e o mesmo quadro em dois eventos separados dizem "chegou
  // partido". São defeitos diferentes, com consertos diferentes.
  const linha = `${Date.now()} len=${dados.length} hex=${dados.toString('hex')}\n`;

  if (capturaEscritos + linha.length > CAPTURA_TETO_BYTES) {
    capturaDesistiu = true;
    avisar?.(`captura do Freestyler atingiu o teto de ${CAPTURA_TETO_BYTES} bytes; parando de gravar`);
    return;
  }

  try {
    // `appendFileSync` de propósito: se o processo morrer no meio, o que já foi
    // capturado continua no disco. É o caso que mais interessa investigar.
    mkdirSync(dirname(arquivo), { recursive: true });
    appendFileSync(arquivo, linha);
    capturaEscritos += linha.length;

    if (!capturaAnunciou) {
      capturaAnunciou = true;
      avisar?.(`captura do stream do Freestyler ativa em ${arquivo}`);
    }
  } catch {
    // Diagnóstico não pode derrubar a leitura da mesa. Desiste em silêncio: um
    // aviso por evento encheria o log com o problema errado.
    capturaDesistiu = true;
  }
}

export function criarCliente(opções: OpçõesDoCliente): ClienteFreestyler {
  const timeoutMs = opções.timeoutDeConsultaMs ?? 2000;
  let socket: net.Socket | null = null;
  let ativo = false;

  // O protocolo não tem id de requisição: as respostas voltam na ordem em que
  // as consultas saíram. A fila correlaciona pela ordem, e é por isso que as
  // consultas precisam ser serializadas por quem chama.
  const fila: Pendente[] = [];

  function limparFila(motivo: string): void {
    while (fila.length > 0) {
      const p = fila.shift() as Pendente;
      clearTimeout(p.temporizador);
      p.resolver({ ok: false, motivo: 'indisponivel', detalhe: motivo });
    }
  }

  function aoReceber(dados: Buffer): void {
    // ⚠️ TEMPORÁRIA, ligada por padrão. Ver o comentário de `capturar`.
    capturar(dados, opções.aoCapturar);

    // O pulso chega no ritmo dele, sem relação com o tráfego. Não é resposta e
    // não pode consumir uma entrada da fila (FR-021c).
    if (ehHeartbeat(dados)) {
      opções.aoPulso?.();
      return;
    }

    const pendente = fila.shift();
    if (!pendente) return; // resposta sem consulta correspondente: descarta
    clearTimeout(pendente.temporizador);
    pendente.resolver(decodificarResposta(dados));
  }

  return {
    conectado: () => ativo,

    conectar() {
      return new Promise<Resultado<void>>((resolve) => {
        const s = new net.Socket();
        let resolvido = false;
        const terminar = (r: Resultado<void>): void => {
          if (resolvido) return;
          resolvido = true;
          resolve(r);
        };

        s.on('error', (e) => {
          ativo = false;
          limparFila(e.message);
          terminar({ ok: false, motivo: 'indisponivel', detalhe: e.message });
        });

        s.on('close', () => {
          if (socket === s) {
            ativo = false;
            socket = null;
            limparFila('socket fechado');
            opções.aoCair?.();
          }
        });

        s.on('data', aoReceber);

        s.connect(opções.port, opções.host, () => {
          socket = s;
          ativo = true;
          terminar({ ok: true, valor: undefined });
        });
      });
    },

    enviar(texto) {
      if (!ativo || socket === null) {
        return { ok: false, motivo: 'indisponivel', detalhe: 'não conectado' };
      }
      try {
        socket.write(texto, 'latin1');
        return { ok: true, valor: undefined };
      } catch (e) {
        return {
          ok: false,
          motivo: 'indisponivel',
          detalhe: e instanceof Error ? e.message : 'falha ao escrever',
        };
      }
    },

    consultar(codigo) {
      return new Promise<Resultado<RespostaDecodificada>>((resolve) => {
        if (!ativo || socket === null) {
          resolve({ ok: false, motivo: 'indisponivel', detalhe: 'não conectado' });
          return;
        }

        const temporizador = setTimeout(() => {
          const i = fila.findIndex((p) => p.resolver === resolve);
          if (i >= 0) fila.splice(i, 1);
          resolve({ ok: false, motivo: 'indisponivel', detalhe: 'consulta sem resposta' });
        }, timeoutMs);

        fila.push({ resolver: resolve, temporizador });
        socket.write(consulta(codigo), 'latin1');
      });
    },

    fechar() {
      ativo = false;
      limparFila('encerrando');
      const s = socket;
      socket = null;
      s?.end();
      s?.destroy();
    },
  };
}
