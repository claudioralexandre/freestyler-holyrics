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
