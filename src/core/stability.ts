/**
 * Estabilidade do sinal de cor: limiar perceptual + confirmação por permanência.
 *
 * Núcleo puro. Requisitos: FR-006, FR-007, FR-007a, FR-007b, FR-007c, FR-009,
 * FR-009a.
 */

import { deltaE } from './color.ts';
import type { Cor, ParâmetrosDoNúcleo } from './state.ts';
import type { MotivoDeAnúncio } from './events.ts';

/** A fatia do estado que a decisão de cor precisa ver. */
export interface EstadoDeCor {
  readonly corDeReferência: Cor | null;
  readonly candidata: Cor | null;
  readonly ciclosDeConfirmação: number;
}

export interface Anúncio {
  readonly cor: Cor;
  readonly anterior: Cor | null;
  readonly motivo: MotivoDeAnúncio;
  readonly deltaE: number | null;
}

export interface DecisãoDeCor extends EstadoDeCor {
  /** `null` quando nada deve ser anunciado neste ciclo. */
  readonly anúncio: Anúncio | null;
}

/**
 * Decide o que fazer com uma leitura de cor.
 *
 * Duas barreiras, não uma. A leitura precisa **diferir o bastante** da
 * referência (limiar de ΔE) e **se sustentar** por N ciclos seguidos. É a
 * segunda que separa uma troca real de tema de um flash de vídeo ou de uma
 * transição de slide, que passam do limiar mas não duram.
 *
 * Sem referência (arranque ou volta de "sem apresentação"), a primeira leitura
 * válida é adotada e anunciada de imediato: não há contra o que confirmar
 * (FR-009a).
 */
export function avaliarCor(
  estado: EstadoDeCor,
  cor: Cor,
  parâmetros: ParâmetrosDoNúcleo,
): DecisãoDeCor {
  const referência = estado.corDeReferência;

  if (referência === null) {
    return {
      corDeReferência: cor,
      candidata: null,
      ciclosDeConfirmação: 0,
      anúncio: {
        cor,
        anterior: null,
        motivo: 'primeira_leitura',
        deltaE: null,
      },
    };
  }

  // Sempre contra a REFERÊNCIA, nunca contra a candidata anterior. É isso que
  // permite candidatas diferentes entre si confirmarem a mesma mudança
  // (FR-007c) e que faz o afastamento gradual acabar contando.
  const diferença = deltaE(referência, cor);

  if (diferença <= parâmetros.limiarDeltaE) {
    // Voltou ao normal: a contagem zera e o salto passageiro morre aqui
    // (FR-007b).
    return {
      corDeReferência: referência,
      candidata: null,
      ciclosDeConfirmação: 0,
      anúncio: null,
    };
  }

  const confirmações = estado.ciclosDeConfirmação + 1;

  if (confirmações < parâmetros.ciclosDeConfirmacao) {
    return {
      corDeReferência: referência,
      candidata: cor,
      ciclosDeConfirmação: confirmações,
      anúncio: null,
    };
  }

  // Confirmada. A nova referência é ESTA leitura — a mais recente da sequência,
  // não a que iniciou a contagem (FR-009).
  return {
    corDeReferência: cor,
    candidata: null,
    ciclosDeConfirmação: 0,
    anúncio: {
      cor,
      anterior: referência,
      motivo: 'mudanca_confirmada',
      deltaE: diferença,
    },
  };
}
