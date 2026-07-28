/**
 * Eventos emitidos pelo integrador — o contrato exposto desta feature.
 *
 * Contrato: specs/001-leitura-cor-holyrics/contracts/events.md
 *
 * Não é contrato público: o consumidor mora no mesmo processo e no mesmo
 * repositório, então isto pode mudar junto com quem consome, sem versionamento.
 */

import type { Cor, ItemEmExibição, Tema } from './state.ts';

/** Por que o Holyrics foi dado como perdido (FR-017). */
export type CausaDePerda = 'indisponivel' | 'credencial_recusada';

/** Por que uma cor foi anunciada (FR-007a, FR-009a). */
export type MotivoDeAnúncio = 'primeira_leitura' | 'mudanca_confirmada';

export type Evento =
  | {
      readonly tipo: 'cor_anunciada';
      readonly momento: number;
      readonly cor: Cor;
      readonly anterior: Cor | null;
      readonly motivo: MotivoDeAnúncio;
      /** ΔE contra a referência anterior. Ausente na primeira leitura. */
      readonly deltaE: number | null;
    }
  | {
      readonly tipo: 'item_trocado';
      readonly momento: number;
      readonly anterior: ItemEmExibição;
      readonly atual: ItemEmExibição;
    }
  | {
      readonly tipo: 'slide_mudou';
      readonly momento: number;
      readonly de: number;
      readonly para: number;
      readonly total: number | null;
      readonly item: ItemEmExibição;
    }
  | {
      readonly tipo: 'apresentacao_iniciada';
      readonly momento: number;
      readonly item: ItemEmExibição;
    }
  | {
      readonly tipo: 'apresentacao_encerrada';
      readonly momento: number;
      readonly anterior: ItemEmExibição;
    }
  | {
      readonly tipo: 'tema_trocado';
      readonly momento: number;
      readonly anterior: Tema | null;
      readonly atual: Tema | null;
    }
  | {
      readonly tipo: 'holyrics_perdido';
      readonly momento: number;
      readonly causa: CausaDePerda;
    }
  | {
      readonly tipo: 'holyrics_recuperado';
      readonly momento: number;
    };

export type TipoDeEvento = Evento['tipo'];

/**
 * Ordem de entrega dentro de um mesmo ciclo: contexto antes de conteúdo.
 *
 * Um consumidor que reaja à cor já sabe, no momento da entrega, em que item e
 * tema ela ocorreu. `cor_anunciada` vem por último por ser o evento que a
 * feature de saída vai transformar em luz.
 */
const ORDEM: readonly TipoDeEvento[] = [
  'holyrics_perdido',
  'holyrics_recuperado',
  'apresentacao_encerrada',
  'apresentacao_iniciada',
  'item_trocado',
  'slide_mudou',
  'tema_trocado',
  'cor_anunciada',
];

/** Ordena os eventos de um ciclo conforme o contrato. Estável e pura. */
export function ordenarEventos(eventos: readonly Evento[]): Evento[] {
  return [...eventos].sort(
    (a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo),
  );
}
