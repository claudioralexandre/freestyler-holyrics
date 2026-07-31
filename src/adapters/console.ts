/**
 * Linha de console legível a cada troca de cor.
 *
 * Existe porque o log do pino sai em JSON: durante um culto ninguém lê
 * `{"evento":"cor_anunciada","cor":{...}}` de relance. Esta linha mostra, com
 * uma amostra pintada no próprio terminal, a cor que as fixtures vão assumir.
 *
 * O JSON continua no arquivo — é ele que serve à calibração e ao pós-culto.
 * Esta saída é para o olho, na hora.
 */

import type { Evento } from '../core/events.ts';
import type { Cor } from '../core/state.ts';

type Anúncio = Extract<Evento, { tipo: 'cor_anunciada' }>;

export interface OpçõesDeFormato {
  /** Ligado só em TTY: redirecionado para arquivo, ANSI viraria lixo. */
  readonly cores: boolean;
}

function hex(cor: Cor): string {
  const dois = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${dois(cor.r)}${dois(cor.g)}${dois(cor.b)}`;
}

/** Amostra em truecolor: o mesmo RGB que vai para a mesa, sem quantizar. */
function amostra(cor: Cor, cores: boolean): string {
  if (!cores) return '';
  return `\u001b[38;2;${cor.r};${cor.g};${cor.b}m███\u001b[0m `;
}

/**
 * Monta a linha. Pura — é ela que os testes cobrem.
 *
 * Formato: `███ #C81E1E rgb(200, 30, 30)  ← #1E3A8A  ΔE 42.57`
 */
export function formatarAnúncioDeCor(evento: Anúncio, opções: OpçõesDeFormato): string {
  const { cores } = opções;
  const partes = [
    `${amostra(evento.cor, cores)}${hex(evento.cor)}`,
    `rgb(${evento.cor.r}, ${evento.cor.g}, ${evento.cor.b})`,
  ];

  if (evento.anterior === null) {
    partes.push('cor inicial');
  } else {
    partes.push(`← ${amostra(evento.anterior, cores)}${hex(evento.anterior)}`);
    if (evento.deltaE !== null) partes.push(`ΔE ${evento.deltaE.toFixed(2)}`);
  }

  return partes.join('  ');
}

export interface PainelDeCor {
  /** Recebe qualquer evento; só reage ao anúncio de cor. */
  aoEvento(evento: Evento): void;
}

export interface OpçõesDoPainel {
  /** Injetado para o teste não escrever no terminal de verdade. */
  readonly escrever?: (linha: string) => void;
  /** Injetado porque `isTTY` não é decidível em teste. */
  readonly cores?: boolean;
}

/**
 * Consumidor de eventos que imprime a cor assumida.
 *
 * Nunca lança para fora: o runtime trata falha de ouvinte, mas uma linha de
 * console não é razão para nem chegar lá (Princípio IV).
 */
export function criarPainelDeCor(opções: OpçõesDoPainel = {}): PainelDeCor {
  const escrever = opções.escrever ?? ((linha: string) => process.stdout.write(linha));
  const cores = opções.cores ?? process.stdout.isTTY === true;

  return {
    aoEvento(evento) {
      if (evento.tipo !== 'cor_anunciada') return;
      try {
        escrever(`${formatarAnúncioDeCor(evento, { cores })}\n`);
      } catch {
        // Terminal fechado, pipe rompido: a luz não depende desta linha.
      }
    },
  };
}
