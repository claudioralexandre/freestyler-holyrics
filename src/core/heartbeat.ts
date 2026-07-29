/**
 * Disponibilidade do Freestyler pelo pulso de vida. Puro: o tempo entra como
 * argumento, nunca via `Date.now()`.
 *
 * **Por que não basta olhar o socket.** Um socket TCP aberto não denuncia uma
 * mesa travada: os `write` continuam devolvendo sucesso para o vazio,
 * possivelmente pelo culto inteiro. O FreeStyler emite um byte `0xFF` a cada
 * ~1499 ms, incondicionalmente — verificado com 0, 1 e 5 comandos enviados,
 * sempre 6 pulsos em 9 segundos. É o único sinal de saúde disponível.
 *
 * **O pulso não é ACK.** Chega no ritmo dele, sem relação com o tráfego
 * (FR-021c). Receber pulso não confirma comando nenhum.
 */

export interface EstadoDeHeartbeat {
  readonly disponível: boolean;
  /** Horário do último `0xFF`, ou `null` se nenhum chegou ainda. */
  readonly últimoPulso: number | null;
  /** Falso até a primeira avaliação — evita transição falsa no primeiro ciclo. */
  readonly jáAvaliado: boolean;
}

export type EventoDeHeartbeat = 'freestyler_perdido' | 'freestyler_recuperado';

export interface VereditoDeHeartbeat {
  readonly estado: EstadoDeHeartbeat;
  /** Preenchido só na transição (FR-021). */
  readonly evento: EventoDeHeartbeat | null;
}

export const DISPONIBILIDADE_INICIAL: EstadoDeHeartbeat = {
  disponível: false,
  últimoPulso: null,
  jáAvaliado: false,
};

/** Anota que um pulso chegou. Não conclui nada sobre disponibilidade. */
export function registrarPulso(
  estado: EstadoDeHeartbeat,
  momento: number,
): EstadoDeHeartbeat {
  return { ...estado, últimoPulso: momento };
}

/**
 * Conclui se o Freestyler está vivo, e diz se isso mudou.
 *
 * O primeiro veredito **sempre** emite evento, mesmo sem transição real: é o
 * que garante que um Freestyler fechado na subida apareça no log. A 001 só
 * descobriu esse defeito em teste ponta a ponta, e a correção está replicada
 * aqui de propósito.
 */
export function avaliarPulso(
  estado: EstadoDeHeartbeat,
  momento: number,
  janelaMs: number,
): VereditoDeHeartbeat {
  const disponível =
    estado.últimoPulso !== null && momento - estado.últimoPulso <= janelaMs;

  const houveTransição = !estado.jáAvaliado || disponível !== estado.disponível;

  return {
    estado: { ...estado, disponível, jáAvaliado: true },
    evento: houveTransição
      ? disponível
        ? 'freestyler_recuperado'
        : 'freestyler_perdido'
      : null,
  };
}
