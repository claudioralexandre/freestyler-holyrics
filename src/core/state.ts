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
import { ordenarEventos, type Evento } from './events.ts';
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
}

export const ESTADO_INICIAL: EstadoDoServiço = {
  corDeReferência: null,
  candidata: null,
  ciclosDeConfirmação: 0,
  item: null,
  tema: null,
  últimoSucesso: { cor: null, item: null, tema: null },
};

/** Parâmetros de decisão que o núcleo recebe do chamador (FR-018). */
export interface ParâmetrosDoNúcleo {
  /** Índice 0–7 da região do color map (FR-002). */
  readonly regiao: number;
  /** Limiar de diferença perceptual (FR-007). */
  readonly limiarDeltaE: number;
  /** Leituras consecutivas acima do limiar para confirmar (FR-007a). */
  readonly ciclosDeConfirmacao: number;
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
  const contexto = diferençaDeContexto(estado, leitura);
  eventos.push(...contexto.eventos);

  let corDeReferência = contexto.descartarCor ? null : estado.corDeReferência;
  let candidata = contexto.descartarCor ? null : estado.candidata;
  let ciclosDeConfirmação = contexto.descartarCor
    ? 0
    : estado.ciclosDeConfirmação;

  // --- Conteúdo: a cor -----------------------------------------------------
  let horárioDaCor = estado.últimoSucesso.cor;

  // "Sem apresentação significa sem cor": nesse estado a feature não inventa cor
  // padrão nem preserva a anterior — apenas reporta o estado.
  //
  // A condição exige `leitura.item.ok`: só pulamos a cor quando *sabemos* que
  // não há apresentação. Se a consulta de item falhou, não sabemos de nada, e a
  // cor segue sendo avaliada normalmente (FR-004a).
  const semApresentação = leitura.item.ok && contexto.item === null;

  if (leitura.cor.ok && !semApresentação) {
    const selecionada = selecionarRegiao(leitura.cor.valor, parâmetros.regiao);

    if (selecionada.ok) {
      horárioDaCor = leitura.momento;

      const decisão = avaliarCor(
        { corDeReferência, candidata, ciclosDeConfirmação },
        selecionada.valor,
        parâmetros,
      );

      corDeReferência = decisão.corDeReferência;
      candidata = decisão.candidata;
      ciclosDeConfirmação = decisão.ciclosDeConfirmação;

      if (decisão.anúncio !== null) {
        eventos.push({
          tipo: 'cor_anunciada',
          momento: leitura.momento,
          cor: decisão.anúncio.cor,
          anterior: decisão.anúncio.anterior,
          motivo: decisão.anúncio.motivo,
          deltaE: decisão.anúncio.deltaE,
        });
      }
    }
    // Região inexistente: leitura descartada, referência preservada (FR-002a).
  }
  // Consulta de cor falhou: referência preservada, nada anunciado (FR-005).

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
    },
    eventos: ordenarEventos(eventos),
  };
}
