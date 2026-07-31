import { describe, expect, it } from 'vitest';
import { formatarAnúncioDeCor } from '../../src/adapters/console.ts';
import type { Evento } from '../../src/core/events.ts';

function anúncio(parcial: Partial<Extract<Evento, { tipo: 'cor_anunciada' }>> = {}) {
  return {
    tipo: 'cor_anunciada',
    momento: 0,
    cor: { r: 30, g: 58, b: 138 },
    anterior: null,
    motivo: 'primeira_leitura',
    deltaE: null,
    ...parcial,
  } as Extract<Evento, { tipo: 'cor_anunciada' }>;
}

describe('linha de console da cor assumida', () => {
  it('mostra o hexadecimal e os componentes da cor nova', () => {
    const linha = formatarAnúncioDeCor(anúncio(), { cores: false });

    expect(linha).toContain('#1E3A8A');
    expect(linha).toContain('rgb(30, 58, 138)');
  });

  it('identifica a primeira leitura como cor inicial', () => {
    const linha = formatarAnúncioDeCor(anúncio(), { cores: false });

    expect(linha).toContain('cor inicial');
    expect(linha).not.toContain('ΔE');
  });

  it('mostra a cor anterior e o ΔE quando a mudança foi confirmada', () => {
    const linha = formatarAnúncioDeCor(
      anúncio({
        cor: { r: 200, g: 30, b: 30 },
        anterior: { r: 30, g: 58, b: 138 },
        motivo: 'mudanca_confirmada',
        deltaE: 42.567,
      }),
      { cores: false },
    );

    expect(linha).toContain('#C81E1E');
    expect(linha).toContain('#1E3A8A');
    expect(linha).toContain('ΔE 42.57');
  });

  it('sem cores no terminal, não emite nenhuma sequência ANSI', () => {
    const linha = formatarAnúncioDeCor(anúncio(), { cores: false });

    // eslint-disable-next-line no-control-regex
    expect(linha).not.toMatch(/\u001b\[/);
  });

  it('com cores no terminal, pinta a amostra com o RGB exato da cor', () => {
    const linha = formatarAnúncioDeCor(anúncio(), { cores: true });

    // Truecolor: é o mesmo RGB que vai para a mesa, sem quantizar para 256.
    expect(linha).toContain('\u001b[38;2;30;58;138m');
    expect(linha).toContain('\u001b[0m');
  });

  it('zeros à esquerda não somem do hexadecimal', () => {
    const linha = formatarAnúncioDeCor(
      anúncio({ cor: { r: 0, g: 5, b: 16 } }),
      { cores: false },
    );

    expect(linha).toContain('#000510');
  });
});
