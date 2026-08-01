import { describe, expect, it } from 'vitest';
import type { Evento } from '../../src/core/events.ts';
import type { Cor } from '../../src/core/state.ts';
import {
  aplicarEvento,
  estadoInicial,
  planejarEnvio,
  type EstadoDaSaída,
  type LeituraDaMesa,
} from '../../src/core/saida.ts';

const AZUL: Cor = { r: 0, g: 0, b: 255 };
const VERMELHO: Cor = { r: 255, g: 0, b: 0 };
const REPOUSO: Cor = { r: 40, g: 20, b: 0 };

const corAnunciada = (cor: Cor): Evento => ({
  tipo: 'cor_anunciada',
  momento: 1000,
  cor,
  anterior: null,
  motivo: 'mudanca_confirmada',
  deltaE: 30,
  // A 002 lê `cor` e ignora a origem — os campos existem porque a 003 os
  // acrescentou ao evento, não porque esta feature os consulta.
  origem: 'extraida',
  tag: null,
  extraída: cor,
});

const GRUPO = { nomeConfigurado: '03: Par Led', nomeReal: '03: Par Led', posição: 3 };

const mesa = (ativos: number[]): LeituraDaMesa => ({
  grupos: ['a', 'b', '03: Par Led', 'd'],
  statusDosGrupos: Array.from({ length: 24 }, (_, i) => ativos.includes(i + 1)),
});

const params = { corDeRepouso: REPOUSO, nomeDoGrupo: '03: Par Led' };

describe('aplicarEvento — do evento para a intenção (T012)', () => {
  it('cor_anunciada define a cor pretendida e destrava a saída', () => {
    const e = aplicarEvento(estadoInicial(), corAnunciada(AZUL), params);

    expect(e.corPretendida).toEqual(AZUL);
    expect(e.jáHouveCor).toBe(true);
  });

  it('não altera a cor pretendida em tema, item, slide ou início (FR-003, FR-006)', () => {
    const base = aplicarEvento(estadoInicial(), corAnunciada(AZUL), params);

    const outros: Evento[] = [
      { tipo: 'tema_trocado', momento: 2000, anterior: null, atual: null },
      { tipo: 'item_trocado', momento: 2000, anterior: null, atual: null },
      { tipo: 'slide_mudou', momento: 2000, de: 1, para: 2, total: 5 },
      { tipo: 'apresentacao_iniciada', momento: 2000 },
    ] as unknown as Evento[];

    for (const ev of outros) {
      expect(aplicarEvento(base, ev, params).corPretendida).toEqual(AZUL);
    }
  });

  it('holyrics_perdido MANTÉM a cor corrente (FR-005)', () => {
    const base = aplicarEvento(estadoInicial(), corAnunciada(AZUL), params);

    const depois = aplicarEvento(
      base,
      { tipo: 'holyrics_perdido', momento: 3000, causa: 'indisponivel' } as unknown as Evento,
      params,
    );

    expect(depois.corPretendida).toEqual(AZUL);
  });

  it('não altera o estado recebido', () => {
    const antes = estadoInicial();
    const copia = JSON.stringify(antes);
    aplicarEvento(antes, corAnunciada(AZUL), params);
    expect(JSON.stringify(antes)).toBe(copia);
  });
});

describe('planejarEnvio — da intenção para as ações (T014)', () => {
  const comCor = (): EstadoDaSaída => aplicarEvento(estadoInicial(), corAnunciada(AZUL), params);

  it('sem divergência entre pretendida e escrita, não há o que fazer (FR-015)', () => {
    const e: EstadoDaSaída = { ...comCor(), últimoConjuntoEscrito: AZUL, grupo: GRUPO };

    expect(planejarEnvio(e, mesa([3]))).toEqual([]);
  });

  it('com divergência e sem leitura da mesa, pede para ler', () => {
    expect(planejarEnvio(comCor(), null)).toEqual(['ler_mesa']);
  });

  it('com a mesa lida e o grupo ainda não resolvido, pede para resolver', () => {
    expect(planejarEnvio(comCor(), mesa([]))).toEqual(['resolver_grupo']);
  });

  it('com o grupo resolvido e inativo, garante a seleção e a confirma (FR-015c)', () => {
    const e: EstadoDaSaída = { ...comCor(), grupo: GRUPO };

    expect(planejarEnvio(e, mesa([]))).toEqual([
      'garantir_selecao',
      'confirmar_selecao',
      'escrever_cor',
    ]);
  });

  it('com o grupo JÁ ativo, não reenvia o toggle — só escreve a cor', () => {
    const e: EstadoDaSaída = { ...comCor(), grupo: GRUPO };

    // Reenviar aqui desligaria o grupo: o comando alterna.
    expect(planejarEnvio(e, mesa([3]))).toEqual(['escrever_cor']);
  });

  it('com outro grupo ativo, ativa o nosso sem desativar o outro (FR-012a-2)', () => {
    const e: EstadoDaSaída = { ...comCor(), grupo: GRUPO };

    expect(planejarEnvio(e, mesa([4]))).toEqual([
      'garantir_selecao',
      'confirmar_selecao',
      'escrever_cor',
    ]);
  });

  it('é idempotente em relação ao status lido', () => {
    const e: EstadoDaSaída = { ...comCor(), grupo: GRUPO };
    const m = mesa([]);

    expect(planejarEnvio(e, m)).toEqual(planejarEnvio(e, m));
  });
});

describe('custo de uma aplicação de cor (T016, FR-014)', () => {
  it('não cresce com o tamanho do grupo', () => {
    const e: EstadoDaSaída = { ...aplicarEvento(estadoInicial(), corAnunciada(AZUL), params), grupo: GRUPO };

    const pequeno = planejarEnvio(e, mesa([]));
    const grande = planejarEnvio(e, {
      ...mesa([]),
      // O número de fixtures do grupo é irrelevante: o integrador fala com o
      // grupo, não com cada luminária.
      grupos: Array.from({ length: 24 }, (_, i) => (i === 2 ? '03: Par Led' : `g${i}`)),
    });

    expect(pequeno).toEqual(grande);
    expect(pequeno.length).toBeLessThanOrEqual(3);
  });
});

describe('nunca restaura a seleção anterior (T017, FR-012c)', () => {
  it('não produz ação de restauração, qualquer que seja o status', () => {
    const e: EstadoDaSaída = { ...aplicarEvento(estadoInicial(), corAnunciada(AZUL), params), grupo: GRUPO };

    for (const ativos of [[], [1], [3], [4], [1, 2]]) {
      const ações = planejarEnvio(e, mesa(ativos));
      expect(ações.join(',')).not.toMatch(/restaur/i);
    }
  });
});

describe('trava de FR-027 — nada antes da primeira cor (T032)', () => {
  it('com jáHouveCor falso, planejarEnvio devolve lista vazia', () => {
    const e: EstadoDaSaída = { ...estadoInicial(), grupo: GRUPO };

    expect(planejarEnvio(e, mesa([]))).toEqual([]);
    expect(planejarEnvio(e, null)).toEqual([]);
  });

  it('apresentacao_encerrada antes da primeira cor não gera repouso', () => {
    const e = aplicarEvento(
      estadoInicial(),
      { tipo: 'apresentacao_encerrada', momento: 500 } as unknown as Evento,
      params,
    );

    expect(e.corPretendida).toBeNull();
    expect(e.jáHouveCor).toBe(false);
  });
});

describe('repouso depois da primeira cor (T034)', () => {
  it('apresentacao_encerrada leva à cor de repouso (FR-004, FR-027a)', () => {
    const base = aplicarEvento(estadoInicial(), corAnunciada(AZUL), params);

    const e = aplicarEvento(
      base,
      { tipo: 'apresentacao_encerrada', momento: 4000 } as unknown as Evento,
      params,
    );

    expect(e.corPretendida).toEqual(REPOUSO);
  });

  it('cor preta anunciada é cor normal, não repouso (FR-026c)', () => {
    const preto: Cor = { r: 0, g: 0, b: 0 };
    const base = aplicarEvento(estadoInicial(), corAnunciada(VERMELHO), params);

    const e = aplicarEvento(base, corAnunciada(preto), params);

    expect(e.corPretendida).toEqual(preto);
    expect(e.corPretendida).not.toEqual(REPOUSO);
  });
});

describe('reconexão reaplica a cor PRETENDIDA, não a fila (T028, FR-020)', () => {
  it('cores que passaram durante a queda não viram fila — vale a última', () => {
    let e = aplicarEvento(estadoInicial(), corAnunciada(AZUL), params);
    // Freestyler fora do ar: nada foi escrito, mas os eventos continuam
    // chegando porque o Holyrics não caiu.
    e = aplicarEvento(e, corAnunciada(VERMELHO), params);
    e = aplicarEvento(e, corAnunciada({ r: 10, g: 20, b: 30 }), params);

    expect(e.corPretendida).toEqual({ r: 10, g: 20, b: 30 });
    expect(e.últimoConjuntoEscrito).toBeNull();
  });

  it('esquecer o que foi escrito faz a cor corrente ser reenviada', () => {
    const e: EstadoDaSaída = {
      ...aplicarEvento(estadoInicial(), corAnunciada(AZUL), params),
      últimoConjuntoEscrito: AZUL,
      grupo: GRUPO,
    };
    expect(planejarEnvio(e, mesa([3]))).toEqual([]);

    // Ao reconectar, o integrador não sabe mais o que está valendo na mesa.
    const apósReconexão: EstadoDaSaída = { ...e, últimoConjuntoEscrito: null, grupo: null };

    expect(planejarEnvio(apósReconexão, mesa([3]))).toEqual(['resolver_grupo']);
  });
});


describe('guardas defensivas', () => {
  it('não planeja nada se a cor pretendida sumir com jáHouveCor verdadeiro', () => {
    // Estado que os invariantes dizem ser impossível. A guarda existe para que
    // um bug futuro vire "nao faz nada" em vez de escrever cor indefinida.
    const e: EstadoDaSaída = {
      corPretendida: null,
      últimoConjuntoEscrito: AZUL,
      grupo: GRUPO,
      jáHouveCor: true,
      gruposConhecidos: [],
    };

    expect(planejarEnvio(e, mesa([3]))).toEqual([]);
  });
});
