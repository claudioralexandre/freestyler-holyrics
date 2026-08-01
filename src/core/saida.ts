/**
 * O núcleo da saída DMX. Puro: sem socket, sem relógio, sem log.
 *
 * São duas funções de propósito, porque acontecem em momentos diferentes:
 *
 *   aplicarEvento   o evento chega sem que ninguém tenha lido a mesa
 *   planejarEnvio   a mesa só é lida quando há trabalho a fazer
 *
 * Juntá-las numa assinatura só escondia uma dependência: decidir se é preciso
 * selecionar o grupo exige o status lido do Freestyler, que não tem como estar
 * disponível no instante em que o evento chega.
 */

import type { Evento } from './events.ts';
import type { GrupoResolvido } from './grupo.ts';
import { precisaSelecionar } from './grupo.ts';
import type { Cor } from './state.ts';

/** O que o Freestyler respondeu neste instante. */
export interface LeituraDaMesa {
  /** `FSBC008000` — indexado por posição, com espaços vazios. */
  readonly grupos: readonly string[];
  /** `FSBC009000` — indexado por posição. */
  readonly statusDosGrupos: readonly boolean[];
}

export interface EstadoDaSaída {
  /** O que deveria estar valendo agora. `null` = nada ainda (FR-027). */
  readonly corPretendida: Cor | null;
  /**
   * O que saiu pelo socket sem o TCP reclamar.
   *
   * Note o nome: **escrito**, não "entregue" nem "aplicado". O protocolo não
   * confirma valor de cor (FR-015b), e o vocabulário do código não pode
   * afirmar o que não é observável.
   */
  readonly últimoConjuntoEscrito: Cor | null;
  readonly grupo: GrupoResolvido | null;
  /** Trava de FR-027: falso até o primeiro `cor_anunciada`. */
  readonly jáHouveCor: boolean;
  /**
   * Nomes de grupo que a mesa reportou no último inventário (004/FR-009).
   *
   * Vazio até o primeiro inventário. Existe para que "o grupo configurado não
   * foi encontrado" venha acompanhado dos que **foram** — sem isso, o
   * diagnóstico diz o que está errado sem dizer o que digitar no lugar.
   */
  readonly gruposConhecidos: readonly string[];
}

export interface ParâmetrosDaSaída {
  readonly corDeRepouso: Cor;
  readonly nomeDoGrupo: string;
}

export type AçãoDeSaída =
  | 'ler_mesa'
  | 'resolver_grupo'
  | 'garantir_selecao'
  | 'confirmar_selecao'
  | 'escrever_cor';

export function estadoInicial(): EstadoDaSaída {
  return {
    corPretendida: null,
    últimoConjuntoEscrito: null,
    grupo: null,
    jáHouveCor: false,
    gruposConhecidos: [],
  };
}

function mesmaCor(a: Cor | null, b: Cor | null): boolean {
  if (a === null || b === null) return a === b;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

/**
 * Traduz um evento da 001 em intenção de cor.
 *
 * Só `cor_anunciada` e `apresentacao_encerrada` mexem em algo. Troca de item,
 * de slide e de tema não geram cor por si (FR-003, FR-006) — a troca que muda a
 * cor já produz `cor_anunciada`, e a que não muda deliberadamente não produz.
 *
 * `holyrics_perdido` mantém a cor: perder a leitura não é o mesmo que a
 * apresentação ter acabado (FR-005).
 */
export function aplicarEvento(
  estado: EstadoDaSaída,
  evento: Evento,
  parâmetros: ParâmetrosDaSaída,
): EstadoDaSaída {
  if (evento.tipo === 'cor_anunciada') {
    return { ...estado, corPretendida: evento.cor, jáHouveCor: true };
  }

  if (evento.tipo === 'apresentacao_encerrada') {
    // Antes da primeira cor o integrador não comanda nada, nem repouso
    // (FR-027). Repouso só passa a valer depois que houve cor de verdade.
    if (!estado.jáHouveCor) return estado;
    return { ...estado, corPretendida: parâmetros.corDeRepouso };
  }

  return estado;
}

/**
 * Diz o que precisa ser feito. Não faz nada.
 *
 * `mesa` é `null` quando ainda não se leu o Freestyler neste ciclo — a leitura
 * é ela própria uma das ações possíveis, e só acontece quando há divergência
 * entre a cor pretendida e a escrita.
 */
export function planejarEnvio(
  estado: EstadoDaSaída,
  mesa: LeituraDaMesa | null,
): readonly AçãoDeSaída[] {
  // Trava de FR-027: nada acontece antes da primeira cor, qualquer que seja o
  // resto do estado. É o que impede o integrador de roubar a seleção da mesa
  // enquanto o operador ainda está configurando o Freestyler.
  if (!estado.jáHouveCor) return [];

  if (estado.corPretendida === null) return [];
  if (mesmaCor(estado.corPretendida, estado.últimoConjuntoEscrito)) return [];

  if (mesa === null) return ['ler_mesa'];
  if (estado.grupo === null) return ['resolver_grupo'];

  const ações: AçãoDeSaída[] = [];

  // O comando de grupo é TOGGLE. Enviar com o grupo já ativo o desligaria, e a
  // luz apagaria em toda aplicação par.
  if (precisaSelecionar(estado.grupo.posição, mesa.statusDosGrupos)) {
    ações.push('garantir_selecao');
    // A seleção é a única coisa confirmável neste protocolo (FR-015c).
    ações.push('confirmar_selecao');
  }

  ações.push('escrever_cor');
  return ações;
}
