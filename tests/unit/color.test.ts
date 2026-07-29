import { describe, expect, it } from 'vitest';
import { selecionarRegiao } from '../../src/core/color.ts';
import { lerColorMap } from '../../src/adapters/holyrics/schema.ts';
import type { LeituraDeCor } from '../../src/core/state.ts';
import {
  colorMapComponenteForaDaFaixa,
  colorMapNulo,
  colorMapNãoÉArray,
  colorMapOk,
  colorMapReal,
} from '../fixtures/holyrics-responses.ts';

const oitoRegioes: LeituraDeCor = {
  regioes: [
    { r: 0, g: 0, b: 255 },
    { r: 0, g: 0, b: 238 },
    { r: 16, g: 16, b: 255 },
    { r: 0, g: 0, b: 128 },
    { r: 255, g: 255, b: 255 },
    { r: 0, g: 0, b: 0 },
    { r: 0, g: 32, b: 255 },
    { r: 0, g: 0, b: 192 },
  ],
};

describe('seleção de região (FR-002)', () => {
  it('devolve a cor da posição pedida', () => {
    const r = selecionarRegiao(oitoRegioes, 2);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toEqual({ r: 16, g: 16, b: 255 });
  });

  it('aceita a posição 0', () => {
    const r = selecionarRegiao(oitoRegioes, 0);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('aceita a posição 7, última do array de 8', () => {
    const r = selecionarRegiao(oitoRegioes, 7);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toEqual({ r: 0, g: 0, b: 192 });
  });

  it('recusa índice além do que veio na resposta (FR-002a)', () => {
    const curto: LeituraDeCor = { regioes: [{ r: 255, g: 0, b: 0 }] };

    const r = selecionarRegiao(curto, 3);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('regiao_inexistente');
    // A API não fornece nomes de região, então a mensagem diz QUANTAS vieram.
    expect(r.detalhe).toMatch(/1/);
  });

  it('recusa array vazio', () => {
    const r = selecionarRegiao({ regioes: [] }, 0);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('regiao_inexistente');
  });

  it('não altera a leitura recebida', () => {
    const antes = JSON.stringify(oitoRegioes);
    selecionarRegiao(oitoRegioes, 4);
    expect(JSON.stringify(oitoRegioes)).toBe(antes);
  });
});

describe('validação do color map recebido', () => {
  it('aceita a resposta documentada, com 8 posições', () => {
    const r = lerColorMap(colorMapOk);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.regioes).toHaveLength(8);
    expect(r.valor.regioes[0]).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('recusa componente fora da faixa 0–255', () => {
    const r = lerColorMap(colorMapComponenteForaDaFaixa);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('resposta_invalida');
  });

  it('recusa data que não é array', () => {
    const r = lerColorMap(colorMapNãoÉArray);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('resposta_invalida');
  });

  // Observado no Holyrics 2.29.1 em 2026-07-28. O contrato documentado dizia
  // `red`; a ferramenta manda `reg`. Sem estes testes a leitura de cor falha
  // em 100% dos ciclos, e o sintoma é "a cor nunca muda" — não um erro visível.
  it('aceita o formato real: campo do vermelho chamado `reg`', () => {
    const r = lerColorMap(colorMapReal);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.regioes).toHaveLength(8);
    expect(r.valor.regioes[0]).toEqual({ r: 255, g: 0, b: 36 });
  });

  it('continua aceitando `red`, caso o Holyrics corrija o nome', () => {
    const r = lerColorMap(colorMapOk);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.regioes[0]).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('trata `data: null` como ausência de cor, não como resposta inválida', () => {
    const r = lerColorMap(colorMapNulo);

    // Sem apresentação em exibição o Holyrics devolve null aqui, igual às
    // outras actions. Classificar isso como falha encheria o log de erro falso
    // em todo momento sem projeção.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.regioes).toEqual([]);
  });
});
