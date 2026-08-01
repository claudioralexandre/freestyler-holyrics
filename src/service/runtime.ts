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

import type { CausaDePerda, Evento, OrigemDaCor } from '../core/events.ts';
import type { GrupoResolvido } from '../core/grupo.ts';
import type {
  Cor,
  EstadoDoServiço,
  ItemEmExibição,
  Tema,
  ÚltimoSucesso,
} from '../core/state.ts';

export type Ouvinte = (evento: Evento) => void;

/**
 * O que a saída DMX reporta ao runtime (004/FR-005, FR-009).
 *
 * Existe porque essas três informações viviam numa closure de `ligarSaídaDMX` e
 * nunca saíam de lá — o que estava certo enquanto ninguém as pedia, e passou a
 * estar errado quando a página passou a mostrá-las.
 */
export interface EstadoDaSaídaObservável {
  readonly disponível: boolean;
  readonly grupo: GrupoResolvido | null;
  readonly gruposConhecidos: readonly string[];
}

export interface EstadoObservável {
  /** A cor que **está valendo** — efetiva, mapeada ou extraída. */
  readonly corDeReferência: Cor | null;
  readonly item: ItemEmExibição | null;
  readonly slide: number | null;
  readonly totalDeSlides: number | null;
  readonly tema: Tema | null;
  readonly holyricsDisponível: boolean;
  /**
   * Por que o Holyrics está fora. `null` quando está no ar — e também no
   * arranque, antes da primeira leitura (004/FR-005).
   *
   * ⚠️ Um booleano sozinho **não** basta aqui. `indisponivel` e
   * `credencial_recusada` pedem ações opostas do operador: abrir o Holyrics
   * contra corrigir uma credencial. Sem esta distinção a página diria "fora do
   * ar" com o Holyrics no ar, que foi exatamente o que aconteceu em 31/07.
   */
  readonly causaDoHolyrics: CausaDePerda | null;
  readonly últimoSucesso: ÚltimoSucesso;
  /** O que a extração calculou, mesmo sob override (004/FR-005). */
  readonly corExtraída: Cor | null;
  /** De onde veio `corDeReferência` (004/FR-008). */
  readonly origemDaCor: OrigemDaCor | null;
  readonly tagDaCor: string | null;
  /**
   * ⚠️ `null` **não** é "indisponível" — é "não há saída DMX configurada".
   *
   * As duas condições pedem ações opostas do operador: uma é configurar, a
   * outra é abrir o Freestyler. Colapsá-las num `false` repetiria o defeito dos
   * dois erros sob o mesmo HTTP 401 que a verificação da 001 achou no Holyrics.
   */
  readonly freestylerDisponível: boolean | null;
  readonly grupoResolvido: GrupoResolvido | null;
  /** Vazio até o primeiro inventário. É o que a FR-009 lista quando não resolve. */
  readonly gruposConhecidos: readonly string[];
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
  atualizarDisponibilidade(disponível: boolean, causa: CausaDePerda | null): void;
  /**
   * Uso interno: registra o estado da saída DMX.
   *
   * Nunca chamado quando não há bloco `freestyler` na configuração — e é essa
   * ausência de chamada que mantém `freestylerDisponível` em `null`.
   */
  atualizarSaída(estado: EstadoDaSaídaObservável): void;
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
  // Começa `null`: "ainda não li nada" não é diagnóstico, e mostrar uma causa
  // no arranque seria acusar sem evidência.
  let causaDoHolyrics: CausaDePerda | null = null;
  // Começa `null`, e a distinção importa: ver `EstadoObservável`.
  let saída: EstadoDaSaídaObservável | null = null;
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

    atualizarDisponibilidade(valor, causa) {
      disponível = valor;
      causaDoHolyrics = causa;
    },

    atualizarSaída(valor) {
      saída = valor;
    },

    snapshot() {
      return {
        corDeReferência: núcleo.corDeReferência,
        item: núcleo.item,
        slide: núcleo.item?.slide ?? null,
        totalDeSlides: núcleo.item?.totalDeSlides ?? null,
        tema: núcleo.tema,
        holyricsDisponível: disponível,
        causaDoHolyrics,
        últimoSucesso: núcleo.últimoSucesso,
        corExtraída: núcleo.corExtraída,
        origemDaCor: núcleo.origemDaCor,
        tagDaCor: núcleo.tagDaCor,
        // `?? null` e não `?? false`: sem saída DMX, a resposta é "não se
        // aplica", não "está fora do ar".
        freestylerDisponível: saída?.disponível ?? null,
        grupoResolvido: saída?.grupo ?? null,
        gruposConhecidos: saída?.gruposConhecidos ?? [],
      };
    },
  };
}
