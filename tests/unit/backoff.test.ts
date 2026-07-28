import { describe, expect, it } from 'vitest';
import { próximoIntervalo } from '../../src/core/backoff.ts';

const PADRÃO = { intervaloInicialMs: 1000, intervaloMaximoMs: 15000 };

describe('progressão do intervalo entre tentativas (FR-015)', () => {
  it('começa no intervalo inicial após a primeira falha', () => {
    expect(próximoIntervalo(1, PADRÃO)).toBe(1000);
  });

  it('dobra a cada falha consecutiva', () => {
    expect(próximoIntervalo(2, PADRÃO)).toBe(2000);
    expect(próximoIntervalo(3, PADRÃO)).toBe(4000);
    expect(próximoIntervalo(4, PADRÃO)).toBe(8000);
  });

  it('para de crescer no teto configurado', () => {
    // 16000 seria o próximo dobro, mas o teto é 15000.
    expect(próximoIntervalo(5, PADRÃO)).toBe(15000);
    expect(próximoIntervalo(6, PADRÃO)).toBe(15000);
    expect(próximoIntervalo(50, PADRÃO)).toBe(15000);
  });

  it('nunca ultrapassa o teto, que é o que mantém o SC-005 alcançável', () => {
    for (let falhas = 1; falhas <= 100; falhas++) {
      expect(próximoIntervalo(falhas, PADRÃO)).toBeLessThanOrEqual(
        PADRÃO.intervaloMaximoMs,
      );
    }
  });

  it('respeita um teto menor que o primeiro dobro', () => {
    const apertado = { intervaloInicialMs: 1000, intervaloMaximoMs: 1500 };

    expect(próximoIntervalo(1, apertado)).toBe(1000);
    expect(próximoIntervalo(2, apertado)).toBe(1500);
  });
});

describe('volta ao início após sucesso (FR-015b)', () => {
  it('zero falhas consecutivas devolve o intervalo inicial', () => {
    // Uma segunda queda não pode herdar o intervalo longo da queda anterior.
    expect(próximoIntervalo(0, PADRÃO)).toBe(1000);
  });
});

describe('determinismo', () => {
  it('mesma contagem, mesmo intervalo', () => {
    expect(próximoIntervalo(3, PADRÃO)).toBe(próximoIntervalo(3, PADRÃO));
  });
});
