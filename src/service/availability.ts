/**
 * Disponibilidade do Holyrics.
 *
 * Requisitos: FR-004c (perdido só quando tudo falha), FR-016 (transição
 * registrada uma vez), FR-017 (credencial recusada é distinta de queda).
 *
 * Mora em `service/` porque é conclusão sobre rede, não sobre conteúdo — o
 * núcleo não deve saber que rede existe (Princípio II). Mas a **decisão** é
 * pura: recebe o resultado do ciclo, devolve veredito. É essa parte que os
 * testes exercitam.
 */

import type { CausaDePerda, Evento } from '../core/events.ts';
import type { LeituraDoCiclo, MotivoDeFalha } from '../core/state.ts';

export interface EstadoDeDisponibilidade {
  readonly disponível: boolean;
  readonly falhasConsecutivas: number;
  /**
   * Falso até o primeiro ciclo ser avaliado.
   *
   * O arranque conta como transição: o serviço sai de "não sei" para um estado
   * conhecido, e isso precisa aparecer no log. Sem isso, subir com o Holyrics
   * fechado — o caso mais comum — ou com token errado não produziria nenhuma
   * mensagem acionável, só um aviso genérico de consulta falha.
   */
  readonly jáAvaliado: boolean;
}

export interface VereditoDeDisponibilidade extends EstadoDeDisponibilidade {
  readonly eventos: readonly Evento[];
}

export const DISPONIBILIDADE_INICIAL: EstadoDeDisponibilidade = {
  disponível: false,
  falhasConsecutivas: 0,
  jáAvaliado: false,
};

/**
 * Falhas que significam "o Holyrics não está atendendo".
 *
 * `resposta_invalida` e `regiao_inexistente` ficam de fora de propósito: nesses
 * casos ele respondeu, só respondeu algo que não entendemos. Tratar isso como
 * queda mandaria o operador olhar o lugar errado.
 */
function éFalhaDeConexão(motivo: MotivoDeFalha): boolean {
  return motivo === 'indisponivel' || motivo === 'credencial_recusada';
}

export function avaliarDisponibilidade(
  estado: EstadoDeDisponibilidade,
  leitura: LeituraDoCiclo,
): VereditoDeDisponibilidade {
  const resultados = [leitura.cor, leitura.item, leitura.tema];

  const motivos = resultados
    .filter((r) => !r.ok)
    .map((r) => (r as { motivo: MotivoDeFalha }).motivo);

  // Perdido só quando TODAS as consultas falharam por conexão (FR-004c).
  const tudoFalhouPorConexão =
    motivos.length === resultados.length && motivos.every(éFalhaDeConexão);

  const disponível = !tudoFalhouPorConexão;
  const falhasConsecutivas = tudoFalhouPorConexão
    ? estado.falhasConsecutivas + 1
    : 0;
  const eventos: Evento[] = [];

  // O primeiro ciclo sempre registra o estado encontrado; depois disso, só as
  // mudanças (FR-016). É o que garante que subir com o Holyrics fechado, ou com
  // token errado, produza uma linha que diz o que fazer.
  const houveTransição = !estado.jáAvaliado || disponível !== estado.disponível;

  if (houveTransição) {
    eventos.push(
      disponível
        ? { tipo: 'holyrics_recuperado', momento: leitura.momento }
        : {
            tipo: 'holyrics_perdido',
            momento: leitura.momento,
            causa: causaDaPerda(motivos),
          },
    );
  }

  return { disponível, falhasConsecutivas, jáAvaliado: true, eventos };
}

/**
 * Credencial recusada prevalece sobre indisponibilidade.
 *
 * Se o token foi rejeitado em qualquer consulta, é isso que precisa aparecer no
 * log — "indisponível" mandaria conferir se o Holyrics está aberto, quando o
 * problema é outro (FR-017).
 */
function causaDaPerda(motivos: readonly MotivoDeFalha[]): CausaDePerda {
  return motivos.includes('credencial_recusada')
    ? 'credencial_recusada'
    : 'indisponivel';
}
