/**
 * Snapshot do runtime — a única porta pela qual a página enxerga o integrador.
 *
 * Requisitos: 004/FR-005 (o que a página mostra) e 004/FR-009 (grupo não
 * resolvido, listando os que existem).
 *
 * `snapshot()` é composição, não espelho: junta o estado do núcleo, a
 * disponibilidade do Holyrics e o estado da saída DMX — três coisas que vivem em
 * lugares diferentes de propósito (Princípio II).
 */

import { describe, expect, it } from 'vitest';
import { criarRuntime } from '../../src/service/runtime.ts';
import { ESTADO_INICIAL, type Cor, type EstadoDoServiço } from '../../src/core/state.ts';

const CINZA: Cor = { r: 120, g: 120, b: 118 };
const AZUL: Cor = { r: 0, g: 40, b: 200 };

const GRUPO = {
  nomeConfigurado: '03: Par Led',
  nomeReal: '03: Par Led',
  posição: 3,
} as const;

function comCor(): EstadoDoServiço {
  return {
    ...ESTADO_INICIAL,
    corDeReferência: AZUL,
    corExtraída: CINZA,
    origemDaCor: 'mapeada',
    tagDaCor: 'azul',
  };
}

describe('o snapshot compõe os campos novos do núcleo (FR-005)', () => {
  it('expõe cor extraída, origem e tag ao lado da cor que está valendo', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });
    runtime.atualizarNúcleo(comCor());

    const s = runtime.snapshot();
    expect(s.corDeReferência).toEqual(AZUL);
    expect(s.corExtraída).toEqual(CINZA);
    expect(s.origemDaCor).toBe('mapeada');
    expect(s.tagDaCor).toBe('azul');
  });

  it('continua expondo o que a 001 já expunha', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });

    const s = runtime.snapshot();
    expect(s.item).toBeNull();
    expect(s.tema).toBeNull();
    expect(s.holyricsDisponível).toBe(false);
    expect(s.últimoSucesso).toEqual({ cor: null, item: null, tema: null });
  });
});

describe('disponibilidade do Freestyler: null e false são coisas diferentes (FR-005)', () => {
  it('é null enquanto nenhuma saída DMX tiver se anunciado', () => {
    // "Você não configurou saída DMX" e "a mesa está fora do ar" pedem ações
    // OPOSTAS do operador. Colapsar os dois num `false` repetiria o defeito dos
    // dois erros sob o mesmo HTTP 401 que a verificação da 001 achou no
    // Holyrics.
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });

    expect(runtime.snapshot().freestylerDisponível).toBeNull();
  });

  it('é false quando há saída DMX e ela está fora do ar', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });
    runtime.atualizarSaída({
      disponível: false,
      grupo: null,
      gruposConhecidos: [],
    });

    expect(runtime.snapshot().freestylerDisponível).toBe(false);
  });

  it('é true quando a mesa está batendo', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });
    runtime.atualizarSaída({
      disponível: true,
      grupo: GRUPO,
      gruposConhecidos: ['01: Movings', '03: Par Led'],
    });

    expect(runtime.snapshot().freestylerDisponível).toBe(true);
  });
});

describe('grupo seguidor e grupos conhecidos (FR-009)', () => {
  it('grupoResolvido é null antes de qualquer resolução', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });

    expect(runtime.snapshot().grupoResolvido).toBeNull();
  });

  it('gruposConhecidos vem vazio antes do primeiro inventário', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });

    expect(runtime.snapshot().gruposConhecidos).toEqual([]);
  });

  it('lista os grupos que existem quando o configurado não resolveu', () => {
    // É o caso que a FR-009 existe para cobrir: sem a lista, "o grupo não foi
    // encontrado" não diz ao operador o que digitar no lugar.
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });
    runtime.atualizarSaída({
      disponível: true,
      grupo: null,
      gruposConhecidos: ['01: Movings', '03: Par Led'],
    });

    const s = runtime.snapshot();
    expect(s.grupoResolvido).toBeNull();
    expect(s.gruposConhecidos).toEqual(['01: Movings', '03: Par Led']);
  });

  it('expõe o grupo resolvido quando ele existe', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });
    runtime.atualizarSaída({
      disponível: true,
      grupo: GRUPO,
      gruposConhecidos: ['03: Par Led'],
    });

    expect(runtime.snapshot().grupoResolvido).toEqual(GRUPO);
  });
});

describe('o snapshot continua sendo cópia, não referência', () => {
  it('não muda quando o estado do núcleo é substituído depois', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });
    const antes = runtime.snapshot();

    runtime.atualizarNúcleo(comCor());

    expect(antes.corDeReferência).toBeNull();
    expect(runtime.snapshot().corDeReferência).toEqual(AZUL);
  });
});

describe('assinatura de eventos (herdado da 001, FR-013b, FR-013c)', () => {
  const evento = {
    tipo: 'cor_anunciada' as const,
    momento: 1000,
    cor: AZUL,
    anterior: null,
    motivo: 'primeira_leitura' as const,
    deltaE: null,
    origem: 'extraida' as const,
    tag: null,
    extraída: AZUL,
  };

  it('entrega os eventos aos inscritos, na ordem recebida', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });
    const vistos: string[] = [];
    runtime.subscribe((e) => vistos.push(e.tipo));

    runtime.emitir([evento, evento]);

    expect(vistos).toEqual(['cor_anunciada', 'cor_anunciada']);
  });

  it('cancelar a inscrição para de entregar', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });
    const vistos: string[] = [];
    const cancelar = runtime.subscribe((e) => vistos.push(e.tipo));

    cancelar();
    runtime.emitir([evento]);

    expect(vistos).toEqual([]);
  });

  it('opera sem nenhum inscrito', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });

    expect(() => runtime.emitir([evento])).not.toThrow();
  });

  it('falha de um consumidor não impede o outro nem derruba o ciclo', () => {
    // O ciclo de leitura não pode parar por causa de quem consome os eventos —
    // é o Princípio IV aplicado dentro do processo.
    const runtime = criarRuntime({
      estadoInicial: ESTADO_INICIAL,
      aoFalharOuvinte: (erro, e) => falhas.push(erro.message + ':' + e.tipo),
    });
    const falhas: string[] = [];
    const vistos: string[] = [];

    runtime.subscribe(() => {
      throw new Error('consumidor quebrado');
    });
    runtime.subscribe((e) => vistos.push(e.tipo));

    expect(() => runtime.emitir([evento])).not.toThrow();
    expect(vistos).toEqual(['cor_anunciada']);
    expect(falhas).toEqual(['consumidor quebrado:cor_anunciada']);
  });

  it('atualizarDisponibilidade reflete no snapshot', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });

    runtime.atualizarDisponibilidade(true, null);

    expect(runtime.snapshot().holyricsDisponível).toBe(true);
  });
});

describe('a página precisa saber POR QUE o Holyrics está fora (004/FR-005)', () => {
  it('sem causa enquanto ele responde', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });
    runtime.atualizarDisponibilidade(true, null);

    const s = runtime.snapshot();
    expect(s.holyricsDisponível).toBe(true);
    expect(s.causaDoHolyrics).toBeNull();
  });

  it('distingue token recusado de máquina inalcançável', () => {
    // As duas pedem ações OPOSTAS: uma é abrir o Holyrics, a outra é corrigir
    // uma credencial. É o mesmo defeito que a verificação da 001 achou no
    // próprio Holyrics — dois erros sob o mesmo 401 — e que a 004 reproduziria
    // na tela se guardasse só um booleano.
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });

    runtime.atualizarDisponibilidade(false, 'indisponivel');
    expect(runtime.snapshot().causaDoHolyrics).toBe('indisponivel');

    runtime.atualizarDisponibilidade(false, 'credencial_recusada');
    expect(runtime.snapshot().causaDoHolyrics).toBe('credencial_recusada');
  });

  it('começa sem causa: indisponível por ainda não ter lido não é diagnóstico', () => {
    const runtime = criarRuntime({ estadoInicial: ESTADO_INICIAL });

    expect(runtime.snapshot().holyricsDisponível).toBe(false);
    expect(runtime.snapshot().causaDoHolyrics).toBeNull();
  });
});
