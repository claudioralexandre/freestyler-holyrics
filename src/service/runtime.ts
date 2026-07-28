/**
 * Composição do serviço: assinatura de eventos e estado consultável.
 *
 * Contrato: specs/001-leitura-cor-holyrics/contracts/events.md
 * Requisitos: FR-013 (assinatura), FR-013a (snapshot), FR-013b (opera sem
 * consumidor), FR-013c (falha do consumidor não derruba nada).
 *
 * `snapshot()` é uma COMPOSIÇÃO, não um espelho: junta o estado do núcleo com a
 * disponibilidade, que é conclusão sobre rede e vive no serviço (Princípio II).
 */

import type { Evento } from '../core/events.ts';
import type {
  Cor,
  EstadoDoServiço,
  ItemEmExibição,
  Tema,
  ÚltimoSucesso,
} from '../core/state.ts';

export type Ouvinte = (evento: Evento) => void;

export interface EstadoObservável {
  readonly corDeReferência: Cor | null;
  readonly item: ItemEmExibição | null;
  readonly slide: number | null;
  readonly totalDeSlides: number | null;
  readonly tema: Tema | null;
  readonly holyricsDisponível: boolean;
  readonly últimoSucesso: ÚltimoSucesso;
}

export interface Runtime {
  /** Inscreve um consumidor. Devolve a função que cancela a inscrição. */
  subscribe(ouvinte: Ouvinte): () => void;
  /** Cópia do estado corrente. Não altera nada. */
  snapshot(): EstadoObservável;
  /** Uso interno do serviço: entrega os eventos de um ciclo. */
  emitir(eventos: readonly Evento[]): void;
  /** Uso interno: substitui o estado do núcleo após um ciclo. */
  atualizarNúcleo(estado: EstadoDoServiço): void;
  /** Uso interno: registra a disponibilidade concluída pelo serviço. */
  atualizarDisponibilidade(disponível: boolean): void;
}

export interface OpçõesDoRuntime {
  readonly estadoInicial: EstadoDoServiço;
  /** Chamado quando um ouvinte lança. Só para registro (FR-013c). */
  readonly aoFalharOuvinte?: (erro: Error, evento: Evento) => void;
}

export function criarRuntime(opções: OpçõesDoRuntime): Runtime {
  const { estadoInicial, aoFalharOuvinte } = opções;

  let núcleo: EstadoDoServiço = estadoInicial;
  // Começa indisponível: só uma leitura bem-sucedida prova o contrário.
  let disponível = false;
  const ouvintes = new Set<Ouvinte>();

  return {
    subscribe(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },

    emitir(eventos) {
      for (const evento of eventos) {
        // Sem nenhum inscrito, o laço simplesmente não roda — o serviço opera
        // normalmente e os eventos seguem indo para o log (FR-013b).
        for (const ouvinte of ouvintes) {
          try {
            ouvinte(evento);
          } catch (erro) {
            // A falha é do consumidor, não nossa. Registra e segue: o ciclo de
            // leitura não pode parar por causa dela (FR-013c).
            aoFalharOuvinte?.(erro as Error, evento);
          }
        }
      }
    },

    atualizarNúcleo(estado) {
      núcleo = estado;
    },

    atualizarDisponibilidade(valor) {
      disponível = valor;
    },

    snapshot() {
      return {
        corDeReferência: núcleo.corDeReferência,
        item: núcleo.item,
        slide: núcleo.item?.slide ?? null,
        totalDeSlides: núcleo.item?.totalDeSlides ?? null,
        tema: núcleo.tema,
        holyricsDisponível: disponível,
        últimoSucesso: núcleo.últimoSucesso,
      };
    },
  };
}
