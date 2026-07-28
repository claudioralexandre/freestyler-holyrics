/**
 * Log do serviço: arquivo rotacionado + terminal, com redação de credencial.
 *
 * Requisitos: FR-013d a FR-013i, FR-019, SC-007, SC-009.
 *
 * Falha ao gravar em arquivo NÃO derruba o serviço (FR-013i): o log cai para
 * somente-terminal e a vida segue. Durante um culto, ficar sem log é degradação;
 * morrer não é opção.
 */

import pino from 'pino';
import type { Config } from './config.ts';
import { deltaE } from '../core/color.ts';
import type { Evento } from '../core/events.ts';
import type { Cor, LeituraDoCiclo } from '../core/state.ts';

export type Logger = pino.Logger;

/** Hexadecimal só para leitura humana do log; a decisão usa os componentes. */
function hex(cor: Cor): string {
  const dois = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${dois(cor.r)}${dois(cor.g)}${dois(cor.b)}`;
}

function descreverCor(cor: Cor) {
  return { hex: hex(cor), r: cor.r, g: cor.g, b: cor.b };
}

/**
 * Registra um evento no nível `info`.
 *
 * É este o log que o operador lê depois do culto: contém os eventos, não uma
 * linha por leitura (FR-013h). O horário vem do próprio pino.
 */
export function registrarEvento(log: Logger, evento: Evento): void {
  switch (evento.tipo) {
    case 'cor_anunciada':
      log.info(
        {
          evento: evento.tipo,
          cor: descreverCor(evento.cor),
          anterior: evento.anterior ? descreverCor(evento.anterior) : null,
          motivo: evento.motivo,
          deltaE: evento.deltaE === null ? null : Number(evento.deltaE.toFixed(2)),
        },
        `cor anunciada: ${hex(evento.cor)}`,
      );
      return;

    case 'item_trocado':
      log.info(
        {
          evento: evento.tipo,
          de: { id: evento.anterior.id, nome: evento.anterior.nome },
          para: { id: evento.atual.id, nome: evento.atual.nome },
        },
        `item trocado: ${evento.anterior.nome || evento.anterior.id} → ${evento.atual.nome || evento.atual.id}`,
      );
      return;

    case 'slide_mudou':
      log.info(
        {
          evento: evento.tipo,
          de: evento.de,
          para: evento.para,
          total: evento.total,
          item: evento.item.nome || evento.item.id,
        },
        `slide ${evento.de} → ${evento.para}${evento.total === null ? '' : ` de ${evento.total}`}`,
      );
      return;

    case 'apresentacao_iniciada':
      log.info(
        { evento: evento.tipo, item: { id: evento.item.id, nome: evento.item.nome } },
        `apresentação iniciada: ${evento.item.nome || evento.item.id}`,
      );
      return;

    case 'apresentacao_encerrada':
      log.info(
        { evento: evento.tipo, anterior: { id: evento.anterior.id, nome: evento.anterior.nome } },
        'apresentação encerrada',
      );
      return;

    case 'tema_trocado':
      log.info(
        {
          evento: evento.tipo,
          // As tags ficam no log para a calibração — nunca decidem cor (FR-005b).
          de: evento.anterior ? { id: evento.anterior.id, nome: evento.anterior.nome, tags: evento.anterior.tags } : null,
          para: evento.atual ? { id: evento.atual.id, nome: evento.atual.nome, tags: evento.atual.tags } : null,
        },
        `tema trocado: ${evento.atual?.nome ?? '(nenhum)'}`,
      );
      return;

    case 'holyrics_perdido':
      log.warn(
        { evento: evento.tipo, causa: evento.causa },
        evento.causa === 'credencial_recusada'
          ? 'Holyrics recusou a credencial — verifique HOLYRICS_TOKEN'
          : 'Holyrics indisponível — tentando reconectar',
      );
      return;

    case 'holyrics_recuperado':
      log.info({ evento: evento.tipo }, 'Holyrics está respondendo');
      return;
  }
}

/**
 * Registra a leitura crua no nível `debug`.
 *
 * As 8 regiões e o ΔE só aparecem aqui — é este o insumo dos cenários 4 e 5 do
 * quickstart, onde região e limiar são calibrados. Em `info`, nada disso polui
 * o log (FR-013h).
 */
export function registrarLeitura(
  log: Logger,
  leitura: LeituraDoCiclo,
  regiaoEscolhida: number,
  referência: Cor | null,
): void {
  if (!log.isLevelEnabled('debug')) return;

  // ΔE da região escolhida contra a referência atual. É este número que a
  // calibração do limiar observa: quanto ele oscila com o telão parado.
  const escolhida = leitura.cor.ok
    ? leitura.cor.valor.regioes[regiaoEscolhida]
    : undefined;
  const diferença =
    escolhida !== undefined && referência !== null
      ? Number(deltaE(referência, escolhida).toFixed(2))
      : null;

  log.debug(
    {
      deltaE: diferença,
      regioes: leitura.cor.ok
        ? leitura.cor.valor.regioes.map((c, i) => ({
            i,
            ...descreverCor(c),
            escolhida: i === regiaoEscolhida,
          }))
        : null,
      falhaDeCor: leitura.cor.ok ? null : leitura.cor.motivo,
      item: leitura.item.ok
        ? (leitura.item.valor && {
            id: leitura.item.valor.id,
            slide: leitura.item.valor.slide,
          }) ?? null
        : `falhou: ${leitura.item.motivo}`,
      tema: leitura.tema.ok ? (leitura.tema.valor?.nome ?? null) : `falhou: ${leitura.tema.motivo}`,
    },
    'leitura',
  );
}

/**
 * Substitui, em profundidade, qualquer string que contenha o token.
 *
 * Segunda barreira: a primeira é nunca passar o token para o log. Esta existe
 * para o caso de uma URL montada com `?token=` escapar por descuido (SC-007).
 */
function criarScrub(token: string) {
  const suficientementeLongo = token.length >= 4;

  return function scrub(valor: unknown): unknown {
    if (typeof valor === 'string') {
      return suficientementeLongo && valor.includes(token)
        ? valor.replaceAll(token, '[REDACTED]')
        : valor;
    }
    if (Array.isArray(valor)) return valor.map(scrub);
    if (valor !== null && typeof valor === 'object') {
      const saída: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(valor)) saída[k] = scrub(v);
      return saída;
    }
    return valor;
  };
}

export interface OpçõesDeLogger {
  readonly log: Config['log'];
  readonly token: string;
  /** Chamado quando a gravação em arquivo falha. Só para diagnóstico. */
  readonly aoFalharArquivo?: (erro: Error) => void;
}

/**
 * Monta o logger.
 *
 * Dois destinos, ambos no nível configurado: o arquivo (rotacionado por tamanho,
 * com limite de arquivos mantidos) e o terminal. O nível `debug` é o que liga o
 * registro por leitura — em `info`, o log contém eventos e não uma linha por
 * segundo (FR-013h).
 */
export function criarLogger(opções: OpçõesDeLogger): Logger {
  const { log, token, aoFalharArquivo } = opções;
  const scrub = criarScrub(token);

  const opçõesBase: pino.LoggerOptions = {
    level: log.nivel,
    // Redação por nome de campo — complementa o scrub por valor.
    redact: {
      paths: ['token', '*.token', 'query', '*.query', 'headers.token'],
      censor: '[REDACTED]',
    },
    formatters: {
      log: (objeto) => scrub(objeto) as Record<string, unknown>,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const destinoTerminal: pino.TransportTargetOptions = {
    target: 'pino/file',
    options: { destination: 1 },
    level: log.nivel,
  };

  const destinoArquivo: pino.TransportTargetOptions = {
    target: 'pino-roll',
    options: {
      file: log.arquivo,
      size: `${log.tamanhoMaximoMb}m`,
      limit: { count: log.arquivosMantidos },
      mkdir: true,
    },
    level: log.nivel,
  };

  try {
    const transporte = pino.transport({
      targets: [destinoTerminal, destinoArquivo],
    });

    // O transporte roda em worker: uma falha de escrita chega como evento, não
    // como exceção. Sem este handler, viraria 'unhandled error' e mataria o
    // processo — exatamente o que a FR-013i proíbe.
    transporte.on('error', (erro: Error) => {
      aoFalharArquivo?.(erro);
      process.stderr.write(
        `[logger] falha ao gravar log em arquivo, seguindo só no terminal: ${erro.message}\n`,
      );
    });

    return pino(opçõesBase, transporte);
  } catch (erro) {
    // Falha na própria criação do transporte (caminho inválido, permissão).
    aoFalharArquivo?.(erro as Error);
    process.stderr.write(
      `[logger] não foi possível abrir o arquivo de log (${log.arquivo}), ` +
        `seguindo só no terminal: ${(erro as Error).message}\n`,
    );
    return pino(opçõesBase);
  }
}
