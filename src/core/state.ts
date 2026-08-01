/**
 * Tipos de domínio e estado do núcleo.
 *
 * Modelo: specs/001-leitura-cor-holyrics/data-model.md
 *
 * Nada aqui faz I/O, lê relógio ou registra log. O horário entra como campo da
 * leitura (`momento`), nunca por chamada a `Date.now()` — é o que torna toda a
 * lógica exercitável sem Holyrics em execução (Princípio II, SC-006).
 */

import { selecionarRegiao } from './color.ts';
import { ordenarEventos, type Evento, type OrigemDaCor } from './events.ts';
import { resolverCorEfetiva, type MapeamentoDeTag } from './override.ts';
import { diferençaDeContexto } from './presentation.ts';
import { avaliarCor } from './stability.ts';

/** Componentes 0–255, inteiros. */
export interface Cor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface ItemEmExibição {
  readonly id: string;
  readonly tipo: string;
  readonly nome: string;
  /** Posição atual. `null` para itens sem noção de slide (imagem, vídeo). */
  readonly slide: number | null;
  readonly totalDeSlides: number | null;
}

export interface Tema {
  readonly id: string;
  readonly nome: string;
  readonly tags: readonly string[];
}

export type MotivoDeFalha =
  /** Conexão recusada, timeout, host inalcançável. */
  | 'indisponivel'
  /** Token rejeitado (FR-017). */
  | 'credencial_recusada'
  /** Respondeu, mas fora do contrato. */
  | 'resposta_invalida'
  /** Índice configurado fora do array recebido (FR-002a). */
  | 'regiao_inexistente';

export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly motivo: MotivoDeFalha; readonly detalhe?: string };

/** O array de 8 posições devolvido pelo Holyrics, já validado. */
export interface LeituraDeCor {
  readonly regioes: readonly Cor[];
}

/**
 * Resultado consolidado de um ciclo. Cada consulta carrega o próprio sucesso ou
 * falha — a falha de uma não invalida as outras (FR-004a).
 */
export interface LeituraDoCiclo {
  readonly momento: number;
  readonly cor: Resultado<LeituraDeCor>;
  readonly item: Resultado<ItemEmExibição | null>;
  readonly tema: Resultado<Tema | null>;
}

/** Horário da última leitura bem-sucedida, por consulta (FR-013a). */
export interface ÚltimoSucesso {
  readonly cor: number | null;
  readonly item: number | null;
  readonly tema: number | null;
}

/**
 * O valor que atravessa os ciclos. Serializável, comparável, sem métodos.
 *
 * Deliberadamente **sem** campo de disponibilidade do Holyrics: isso é conclusão
 * sobre rede e vive em `src/service/availability.ts`. `snapshot()` compõe os dois
 * (Princípio II).
 */
export interface EstadoDoServiço {
  readonly corDeReferência: Cor | null;
  readonly candidata: Cor | null;
  readonly ciclosDeConfirmação: number;
  readonly item: ItemEmExibição | null;
  readonly tema: Tema | null;
  readonly últimoSucesso: ÚltimoSucesso;
  /**
   * Última extração **bem-sucedida** (004/FR-005).
   *
   * Note "última", e não "deste ciclo": sobrevive a um ciclo cuja consulta de
   * cor falhou. A leitura ingênua apagaria o valor da tela a cada falha isolada,
   * e o operador leria isso como "o Holyrics parou de mandar cor".
   */
  readonly corExtraída: Cor | null;
  /**
   * De onde veio `corDeReferência` — a cor que **está valendo** (004/FR-008).
   *
   * ⚠️ Não é a origem da leitura deste ciclo. Sob confirmação por permanência,
   * as duas divergem por N ciclos, e é justamente aí que a página está sendo
   * olhada. Ver o caso decisivo em `tests/unit/state.test.ts`.
   */
  readonly origemDaCor: OrigemDaCor | null;
  /** A tag responsável por `corDeReferência`. `null` quando a origem é extração. */
  readonly tagDaCor: string | null;
}

export const ESTADO_INICIAL: EstadoDoServiço = {
  corDeReferência: null,
  candidata: null,
  ciclosDeConfirmação: 0,
  item: null,
  tema: null,
  últimoSucesso: { cor: null, item: null, tema: null },
  corExtraída: null,
  origemDaCor: null,
  tagDaCor: null,
};

/** Parâmetros de decisão que o núcleo recebe do chamador (FR-018). */
export interface ParâmetrosDoNúcleo {
  /** Índice 0–7 da região do color map (FR-002). */
  readonly regiao: number;
  /** Limiar de diferença perceptual (FR-007). */
  readonly limiarDeltaE: number;
  /** Leituras consecutivas acima do limiar para confirmar (FR-007a). */
  readonly ciclosDeConfirmacao: number;
  /**
   * Mapeamento de tag do tema para cor fixa (feature 003). **Opcional**, e a
   * ausência é o que garante 003/FR-002: sem a seção, nenhum caminho novo é
   * exercitado e o comportamento é o de antes daquela feature.
   *
   * A ordem é significativa: é a regra de precedência (003/FR-007).
   */
  readonly coresPorTag?: readonly MapeamentoDeTag[];
}

/** O que um ciclo produz: o novo estado e o que aconteceu de digno de nota. */
export interface ResultadoDoCiclo {
  readonly estado: EstadoDoServiço;
  readonly eventos: readonly Evento[];
}

/**
 * A transição do núcleo: `(estado, leitura) → (estado, eventos)`.
 *
 * É a única porta de entrada da lógica de decisão. Pura por construção — o
 * horário vem em `leitura.momento`, nunca de `Date.now()` — o que torna cada
 * cenário de aceitação um teste de uma linha, sem preparação (SC-006).
 */
export function aplicarCiclo(
  estado: EstadoDoServiço,
  leitura: LeituraDoCiclo,
  parâmetros: ParâmetrosDoNúcleo,
): ResultadoDoCiclo {
  const eventos: Evento[] = [];

  // --- Contexto: item, slide e tema ---------------------------------------
  const contexto = diferençaDeContexto(estado, leitura, parâmetros.coresPorTag ?? []);
  eventos.push(...contexto.eventos);

  let corDeReferência = contexto.descartarCor ? null : estado.corDeReferência;
  let candidata = contexto.descartarCor ? null : estado.candidata;
  let ciclosDeConfirmação = contexto.descartarCor
    ? 0
    : estado.ciclosDeConfirmação;

  // Os três acompanham a referência no descarte (004/FR-005). Deixá-los para
  // trás faria a página descrever uma cor que não existe mais.
  let corExtraída = contexto.descartarCor ? null : estado.corExtraída;
  let origemDaCor = contexto.descartarCor ? null : estado.origemDaCor;
  let tagDaCor = contexto.descartarCor ? null : estado.tagDaCor;

  // --- Conteúdo: a cor -----------------------------------------------------
  let horárioDaCor = estado.últimoSucesso.cor;

  // "Sem apresentação significa sem cor": nesse estado a feature não inventa cor
  // padrão nem preserva a anterior — apenas reporta o estado.
  //
  // A condição exige `leitura.item.ok`: só pulamos a cor quando *sabemos* que
  // não há apresentação. Se a consulta de item falhou, não sabemos de nada, e a
  // cor segue sendo avaliada normalmente (FR-004a).
  const semApresentação = leitura.item.ok && contexto.item === null;

  // ⚠️ As duas condições abaixo eram UMA só antes da feature 003, e continuam
  // vizinhas. Elas divergem de propósito e afrouxar uma não pode afrouxar a
  // outra:
  //
  //   sem apresentação  →  nada é anunciado, mapeado ou não   (003/FR-014a)
  //   sem extração      →  o override ainda vale              (003/FR-008a)
  //
  // Afrouxar a primeira acenderia a luz exatamente no momento em que a 002
  // decidiu não comandar nada (002/FR-027). Manter a segunda fechada deixaria a
  // luz errada só porque uma consulta irrelevante falhou.
  if (!semApresentação) {
    // A extração deixou de ser pré-condição: `null` aqui é entrada legítima, e
    // a cor declarada cobre. Região inexistente cai no mesmo caso (FR-002a).
    const selecionada = leitura.cor.ok
      ? selecionarRegiao(leitura.cor.valor, parâmetros.regiao)
      : null;
    const extraída = selecionada !== null && selecionada.ok ? selecionada.valor : null;

    // `últimoSucesso.cor` é registro de LEITURA, não de anúncio: só avança com
    // extração válida, mesmo sob override. Confundir os dois faria o diagnóstico
    // de "há quanto tempo o Holyrics não responde cor" mentir justamente durante
    // um override.
    if (extraída !== null) {
      horárioDaCor = leitura.momento;
      corExtraída = extraída;
    }

    const efetiva = resolverCorEfetiva(extraída, contexto.casamento);

    if (efetiva !== null) {
      // É a EFETIVA que entra na máquina de estabilidade — nunca a extraída.
      // É só isso que faz 003/FR-010 e FR-011 valerem: na troca para um tema
      // mapeado a efetiva muda ainda que a extraída não mude, e o mecanismo
      // anti-flicker detecta sem saber que override existe. `stability.ts`
      // permanece intocado, o que é a garantia estrutural de 003/FR-012.
      const decisão = avaliarCor(
        { corDeReferência, candidata, ciclosDeConfirmação },
        efetiva.cor,
        parâmetros,
      );

      corDeReferência = decisão.corDeReferência;
      candidata = decisão.candidata;
      ciclosDeConfirmação = decisão.ciclosDeConfirmação;

      if (decisão.anúncio !== null) {
        // A origem só muda quando a REFERÊNCIA muda, e é isso que faz os dois
        // campos descreverem o que está valendo em vez do que foi lido agora
        // (004/FR-008).
        origemDaCor = efetiva.origem;
        tagDaCor = efetiva.tag;

        eventos.push({
          tipo: 'cor_anunciada',
          momento: leitura.momento,
          cor: decisão.anúncio.cor,
          anterior: decisão.anúncio.anterior,
          motivo: decisão.anúncio.motivo,
          deltaE: decisão.anúncio.deltaE,
          origem: efetiva.origem,
          tag: efetiva.tag,
          extraída: efetiva.extraída,
        });
      }
    }
    // Sem extração e sem override: nada a anunciar, referência preservada
    // (FR-005).
  }

  return {
    estado: {
      corDeReferência,
      candidata,
      ciclosDeConfirmação,
      item: contexto.item,
      tema: contexto.tema,
      últimoSucesso: {
        cor: horárioDaCor,
        item: leitura.item.ok ? leitura.momento : estado.últimoSucesso.item,
        tema: leitura.tema.ok ? leitura.momento : estado.últimoSucesso.tema,
      },
      corExtraída,
      origemDaCor,
      tagDaCor,
    },
    eventos: ordenarEventos(eventos),
  };
}
