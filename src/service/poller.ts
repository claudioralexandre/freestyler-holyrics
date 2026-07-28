/**
 * Ciclo de leitura.
 *
 * Requisitos: FR-001 (intervalo configurável), FR-003 (as três consultas no
 * mesmo ciclo), FR-004 (sem sobreposição), FR-004a (consultas independentes),
 * FR-004b (falha parcial registrada uma vez).
 *
 * Isto não é núcleo puro (tem relógio e rede) nem adaptador (não traduz
 * formato): é orquestração. A decisão de quanto esperar entra por injeção, para
 * que a política de backoff continue sendo lógica pura e testável.
 */

import type { ClienteHolyrics } from '../adapters/holyrics/client.ts';
import type {
  LeituraDoCiclo,
  MotivoDeFalha,
  Resultado,
} from '../core/state.ts';

/**
 * Converte o resultado de `allSettled` em `Resultado`.
 *
 * Uma rejeição aqui significa defeito no cliente, não indisponibilidade do
 * Holyrics — mas o efeito prático é o mesmo: aquela consulta não trouxe dado.
 */
function desempacotar<T>(
  liquidado: PromiseSettledResult<Resultado<T>>,
): Resultado<T> {
  if (liquidado.status === 'fulfilled') return liquidado.value;
  return {
    ok: false,
    motivo: 'resposta_invalida',
    detalhe: `consulta lançou: ${String(liquidado.reason)}`,
  };
}

export interface OpçõesDoPoller {
  readonly cliente: ClienteHolyrics;
  /** Injetado para manter o ciclo testável e o relógio fora do núcleo. */
  readonly agora: () => number;
  readonly dormir: (ms: number) => Promise<void>;
  /** Chamado a cada ciclo com a leitura consolidada. */
  readonly aoLer: (leitura: LeituraDoCiclo) => void;
  /** Quanto esperar antes do próximo ciclo. Recebe o resultado do atual. */
  readonly calcularAtraso: (leitura: LeituraDoCiclo) => number;
  /** Notificado quando uma consulta falha e as outras não (FR-004b). */
  readonly aoFalharParcialmente?: (
    falhas: ReadonlyMap<string, MotivoDeFalha>,
  ) => void;
}

export interface Poller {
  iniciar(): void;
  parar(): Promise<void>;
}

/** Assinatura das falhas do ciclo, para não repetir log a cada volta. */
function assinaturaDeFalhas(leitura: LeituraDoCiclo): string {
  const parte = (nome: string, r: { ok: boolean; motivo?: MotivoDeFalha }) =>
    r.ok ? '' : `${nome}:${r.motivo}`;
  return [
    parte('cor', leitura.cor),
    parte('item', leitura.item),
    parte('tema', leitura.tema),
  ]
    .filter(Boolean)
    .join('|');
}

export function criarPoller(opções: OpçõesDoPoller): Poller {
  const {
    cliente,
    agora,
    dormir,
    aoLer,
    calcularAtraso,
    aoFalharParcialmente,
  } = opções;

  let rodando = false;
  let terminou: Promise<void> = Promise.resolve();
  let últimaAssinaturaDeFalha = '';

  async function umCiclo(): Promise<LeituraDoCiclo> {
    // As três consultas partem juntas mas são avaliadas separadamente: a falha
    // de uma não invalida as outras (FR-004a). Os métodos do cliente devolvem
    // Resultado em vez de lançar, mas `allSettled` garante que nem um defeito
    // inesperado num deles derrube o ciclo (Princípio IV).
    const [cor, item, tema] = await Promise.allSettled([
      cliente.lerCor(),
      cliente.lerApresentação(),
      cliente.lerTema(),
    ]);

    return {
      momento: agora(),
      cor: desempacotar(cor),
      item: desempacotar(item),
      tema: desempacotar(tema),
    };
  }

  function relatarFalhaParcial(leitura: LeituraDoCiclo): void {
    const assinatura = assinaturaDeFalhas(leitura);

    // Só relata quando a condição muda — senão o log de um culto inteiro viraria
    // a mesma linha repetida sete mil vezes (FR-004b).
    if (assinatura === últimaAssinaturaDeFalha) return;
    últimaAssinaturaDeFalha = assinatura;

    if (assinatura === '') return;

    const falhas = new Map<string, MotivoDeFalha>();
    if (!leitura.cor.ok) falhas.set('cor', leitura.cor.motivo);
    if (!leitura.item.ok) falhas.set('item', leitura.item.motivo);
    if (!leitura.tema.ok) falhas.set('tema', leitura.tema.motivo);
    aoFalharParcialmente?.(falhas);
  }

  async function laço(): Promise<void> {
    while (rodando) {
      const leitura = await umCiclo();

      relatarFalhaParcial(leitura);
      aoLer(leitura);

      // O próximo ciclo só começa depois que este terminou — nunca há dois em
      // voo ao mesmo tempo (FR-004).
      if (!rodando) break;
      await dormir(calcularAtraso(leitura));
    }
  }

  return {
    iniciar() {
      if (rodando) return;
      rodando = true;
      terminou = laço();
    },

    async parar() {
      rodando = false;
      await terminou;
    },
  };
}
