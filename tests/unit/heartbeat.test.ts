import { describe, expect, it } from 'vitest';
import {
  DISPONIBILIDADE_INICIAL,
  avaliarPulso,
  registrarPulso,
  type EstadoDeHeartbeat,
} from '../../src/core/heartbeat.ts';

const JANELA = 6000;

describe('avaliarPulso (T025)', () => {
  it('considera disponível quando o último pulso está dentro da janela', () => {
    const comPulso = registrarPulso(DISPONIBILIDADE_INICIAL, 10_000);

    const r = avaliarPulso(comPulso, 14_000, JANELA);

    expect(r.estado.disponível).toBe(true);
  });

  it('considera indisponível quando o pulso envelheceu além da janela', () => {
    const comPulso = registrarPulso(DISPONIBILIDADE_INICIAL, 10_000);

    const r = avaliarPulso(comPulso, 17_000, JANELA);

    expect(r.estado.disponível).toBe(false);
  });

  it('trata a borda exata da janela como ainda disponível', () => {
    const comPulso = registrarPulso(DISPONIBILIDADE_INICIAL, 10_000);

    expect(avaliarPulso(comPulso, 16_000, JANELA).estado.disponível).toBe(true);
    expect(avaliarPulso(comPulso, 16_001, JANELA).estado.disponível).toBe(false);
  });

  it('emite evento UMA vez por transição, não a cada avaliação (FR-021)', () => {
    let e = registrarPulso(DISPONIBILIDADE_INICIAL, 10_000);

    const primeira = avaliarPulso(e, 11_000, JANELA);
    expect(primeira.evento).toBe('freestyler_recuperado');
    e = primeira.estado;

    const segunda = avaliarPulso(e, 12_000, JANELA);
    expect(segunda.evento).toBeNull();
    e = segunda.estado;

    const perdeu = avaliarPulso(e, 20_000, JANELA);
    expect(perdeu.evento).toBe('freestyler_perdido');
    e = perdeu.estado;

    const aindaPerdido = avaliarPulso(e, 21_000, JANELA);
    expect(aindaPerdido.evento).toBeNull();
  });

  it('o primeiro ciclo registra o estado encontrado, sem fingir que nada mudou', () => {
    // Mesmo defeito que a 001 revelou só em teste ponta a ponta: sem isso, um
    // Freestyler fechado na subida não produz nenhuma linha de log.
    const r = avaliarPulso(DISPONIBILIDADE_INICIAL, 5_000, JANELA);

    expect(r.estado.disponível).toBe(false);
    expect(r.evento).toBe('freestyler_perdido');
    expect(r.estado.jáAvaliado).toBe(true);
  });

  it('sem nenhum pulso recebido, nunca conclui disponível', () => {
    const r = avaliarPulso(DISPONIBILIDADE_INICIAL, 1, JANELA);

    expect(r.estado.disponível).toBe(false);
  });

  it('não altera o estado recebido', () => {
    const e = registrarPulso(DISPONIBILIDADE_INICIAL, 10_000);
    const antes = JSON.stringify(e);
    avaliarPulso(e, 20_000, JANELA);
    expect(JSON.stringify(e)).toBe(antes);
  });
});

describe('registrarPulso — o pulso não confirma comando (T025, FR-021c)', () => {
  it('só atualiza o horário do último pulso', () => {
    const e: EstadoDeHeartbeat = registrarPulso(DISPONIBILIDADE_INICIAL, 7_000);

    expect(e.últimoPulso).toBe(7_000);
    // Receber pulso não é o mesmo que concluir disponibilidade: a conclusão
    // depende da janela e é feita por avaliarPulso.
    expect(e.disponível).toBe(false);
  });

  it('avança o horário a cada novo pulso', () => {
    let e = registrarPulso(DISPONIBILIDADE_INICIAL, 7_000);
    e = registrarPulso(e, 8_500);

    expect(e.últimoPulso).toBe(8_500);
  });
});
