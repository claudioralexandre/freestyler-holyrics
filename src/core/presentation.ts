/**
 * Diffing do contexto: item em exibição, posição do slide e tema.
 *
 * Núcleo puro. Requisitos: FR-010 a FR-010d, FR-011, FR-012, FR-012a, FR-005b,
 * FR-005c, FR-004a.
 */

import type { Evento } from './events.ts';
import type { EstadoDoServiço, LeituraDoCiclo } from './state.ts';
import type { ItemEmExibição, Tema } from './state.ts';

export interface DiferençaDeContexto {
  readonly item: ItemEmExibição | null;
  readonly tema: Tema | null;
  /** Verdadeiro quando a cor de referência deve ser descartada (FR-012). */
  readonly descartarCor: boolean;
  readonly eventos: readonly Evento[];
}

function mesmoTema(a: Tema | null, b: Tema | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.id === b.id;
}

/**
 * Compara o contexto do ciclo com o anterior e produz os eventos.
 *
 * Consultas que falharam preservam o valor anterior e **não** geram evento — uma
 * falha de rede não pode ser lida como "a apresentação foi encerrada"
 * (FR-004a).
 */
export function diferençaDeContexto(
  estado: EstadoDoServiço,
  leitura: LeituraDoCiclo,
): DiferençaDeContexto {
  const eventos: Evento[] = [];
  const momento = leitura.momento;

  const anterior = estado.item;
  const item = leitura.item.ok ? leitura.item.valor : estado.item;
  const tema = leitura.tema.ok ? leitura.tema.valor : estado.tema;

  let descartarCor = false;

  // O item só é comparado quando a consulta trouxe resposta. Sem isso, uma
  // falha de consulta viraria "apresentação encerrada" no ciclo seguinte.
  if (leitura.item.ok) {
    if (anterior === null && item !== null) {
      eventos.push({ tipo: 'apresentacao_iniciada', momento, item });
    } else if (anterior !== null && item === null) {
      eventos.push({ tipo: 'apresentacao_encerrada', momento, anterior });
      // Sem apresentação não há cor: a próxima leitura será anunciada como
      // primeira, não como mudança (FR-012).
      descartarCor = true;
    } else if (anterior !== null && item !== null) {
      if (anterior.id !== item.id) {
        // Identidade do item é avaliada ANTES da posição: entrar num item novo
        // emite só a troca, ainda que o número do slide tenha mudado junto
        // (FR-010c). E não descarta a cor de referência (FR-012a).
        eventos.push({ tipo: 'item_trocado', momento, anterior, atual: item });
      } else if (
        anterior.slide !== null &&
        item.slide !== null &&
        anterior.slide !== item.slide
      ) {
        // Mesmo item, posição diferente. Avanço e retrocesso produzem o mesmo
        // evento; a direção é inferível de `de`/`para` (FR-010a, FR-010b).
        eventos.push({
          tipo: 'slide_mudou',
          momento,
          de: anterior.slide,
          para: item.slide,
          total: item.totalDeSlides,
          item,
        });
      }
      // Mudança apenas do total de slides não é evento: o valor acompanha a
      // última leitura e pronto (FR-010d).
    }
  }

  // O tema é observação: entra em log e estado, nunca na decisão de cor
  // (FR-005b). Ausência de tema é estado legítimo, não falha (FR-005c).
  if (leitura.tema.ok && !mesmoTema(estado.tema, tema)) {
    eventos.push({ tipo: 'tema_trocado', momento, anterior: estado.tema, atual: tema });
  }

  return { item, tema, descartarCor, eventos };
}
