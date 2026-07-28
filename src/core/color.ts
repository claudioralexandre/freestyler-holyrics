/**
 * Decisões sobre cor: qual região usar e quão diferentes duas cores são.
 *
 * Núcleo puro. Sem I/O, sem relógio, sem log (Princípio II).
 * Requisitos: FR-002, FR-002a, FR-008, FR-008a.
 */

import { differenceCiede2000 } from 'culori';
import type { Cor, LeituraDeCor, Resultado } from './state.ts';

/**
 * Escolhe a região configurada do color map.
 *
 * O Holyrics devolve um array de posições, sem nomes — "região" é um índice.
 * Quando o índice não existe na resposta, a leitura é descartada e o detalhe diz
 * QUANTAS posições vieram, porque nomes de região não são informação que a API
 * forneça (FR-002a).
 */
export function selecionarRegiao(
  leitura: LeituraDeCor,
  regiao: number,
): Resultado<Cor> {
  const cor = leitura.regioes[regiao];

  if (cor === undefined) {
    return {
      ok: false,
      motivo: 'regiao_inexistente',
      detalhe:
        `região ${regiao} não existe na resposta: vieram ` +
        `${leitura.regioes.length} posição(ões)`,
    };
  }

  return { ok: true, valor: cor };
}

/** `culori` trabalha com componentes 0–1; o Holyrics devolve 0–255. */
function paraCulori(cor: Cor) {
  return {
    mode: 'rgb' as const,
    r: cor.r / 255,
    g: cor.g / 255,
    b: cor.b / 255,
  };
}

const ciede2000 = differenceCiede2000();

/**
 * Diferença perceptual entre duas cores (ΔE, CIEDE2000).
 *
 * Perceptual e não aritmética: dois azuis com distância numérica grande podem
 * ser indistinguíveis no telão, e dois tons próximos em número podem saltar aos
 * olhos. O limiar configurado é "quanto o olho precisa notar" (FR-008).
 *
 * Determinística: mesma dupla, mesmo valor, sem depender de relógio, ordem de
 * chamada ou estado externo (FR-008a).
 */
export function deltaE(a: Cor, b: Cor): number {
  return ciede2000(paraCulori(a), paraCulori(b));
}
