import { describe, expect, it } from 'vitest';
import { aplicarCiclo } from '../../src/core/state.ts';
import {
  ESTADO_INICIAL,
  type Cor,
  type LeituraDoCiclo,
  type ItemEmExibição,
  type ParâmetrosDoNúcleo,
} from '../../src/core/state.ts';

export const PARÂMETROS: ParâmetrosDoNúcleo = {
  regiao: 0,
  limiarDeltaE: 10,
  ciclosDeConfirmacao: 2,
};

/**
 * Item genérico em exibição.
 *
 * Presente em quase todo ciclo de teste de propósito: sem apresentação não há
 * cor, então um ciclo "só de cor" seria uma combinação que a spec não permite.
 */
const ITEM: ItemEmExibição = {
  id: 'item-padrao',
  tipo: 'song',
  nome: 'Item de teste',
  slide: 1,
  totalDeSlides: 4,
};

/** Leitura de um ciclo em que só a cor varia. */
export function ciclo(cor: Cor, momento = 1000): LeituraDoCiclo {
  return {
    momento,
    cor: { ok: true, valor: { regioes: [cor] } },
    item: { ok: true, valor: ITEM },
    tema: { ok: true, valor: null },
  };
}

const AZUL: Cor = { r: 0, g: 0, b: 255 };

describe('primeira leitura (FR-009a)', () => {
  it('anuncia de imediato quando não há cor de referência', () => {
    const { estado, eventos } = aplicarCiclo(
      ESTADO_INICIAL,
      ciclo(AZUL),
      PARÂMETROS,
    );

    const anúncios = eventos.filter((e) => e.tipo === 'cor_anunciada');
    expect(anúncios).toHaveLength(1);
    expect(estado.corDeReferência).toEqual(AZUL);
  });

  it('marca o anúncio como primeira_leitura, não como mudança confirmada', () => {
    const { eventos } = aplicarCiclo(ESTADO_INICIAL, ciclo(AZUL), PARÂMETROS);

    const anúncio = eventos.find((e) => e.tipo === 'cor_anunciada');
    expect(anúncio).toBeDefined();
    if (anúncio?.tipo !== 'cor_anunciada') return;
    expect(anúncio.motivo).toBe('primeira_leitura');
    expect(anúncio.anterior).toBeNull();
    // Não há referência contra a qual medir diferença.
    expect(anúncio.deltaE).toBeNull();
  });

  it('não espera confirmação, mesmo com ciclosDeConfirmacao alto', () => {
    const exigente = { ...PARÂMETROS, ciclosDeConfirmacao: 5 };

    const { eventos } = aplicarCiclo(ESTADO_INICIAL, ciclo(AZUL), exigente);

    expect(eventos.some((e) => e.tipo === 'cor_anunciada')).toBe(true);
  });

  it('carrega o momento da leitura no evento', () => {
    const { eventos } = aplicarCiclo(
      ESTADO_INICIAL,
      ciclo(AZUL, 1234),
      PARÂMETROS,
    );

    expect(eventos[0]?.momento).toBe(1234);
  });

  it('registra o horário da leitura de cor bem-sucedida (FR-013a)', () => {
    const { estado } = aplicarCiclo(
      ESTADO_INICIAL,
      ciclo(AZUL, 4321),
      PARÂMETROS,
    );

    expect(estado.últimoSucesso.cor).toBe(4321);
  });
});

describe('leitura de cor que falhou', () => {
  it('não anuncia nada e preserva a referência anterior (FR-005)', () => {
    const comReferência = aplicarCiclo(
      ESTADO_INICIAL,
      ciclo(AZUL),
      PARÂMETROS,
    ).estado;

    const falhou: LeituraDoCiclo = {
      momento: 2000,
      cor: { ok: false, motivo: 'resposta_invalida' },
      item: { ok: true, valor: ITEM },
      tema: { ok: true, valor: null },
    };

    const { estado, eventos } = aplicarCiclo(comReferência, falhou, PARÂMETROS);

    expect(eventos.filter((e) => e.tipo === 'cor_anunciada')).toHaveLength(0);
    expect(estado.corDeReferência).toEqual(AZUL);
    // O horário do último sucesso NÃO avança — é isso que permite depois
    // distinguir "não mudou" de "não é lido há dez minutos".
    expect(estado.últimoSucesso.cor).toBe(1000);
  });

  it('não anuncia quando a região configurada não existe (FR-002a)', () => {
    const semARegião: LeituraDoCiclo = {
      momento: 2000,
      cor: { ok: true, valor: { regioes: [] } },
      item: { ok: true, valor: ITEM },
      tema: { ok: true, valor: null },
    };

    const { estado, eventos } = aplicarCiclo(
      ESTADO_INICIAL,
      semARegião,
      PARÂMETROS,
    );

    expect(eventos.filter((e) => e.tipo === 'cor_anunciada')).toHaveLength(0);
    expect(estado.corDeReferência).toBeNull();
  });
});

describe('contexto e cor são independentes (FR-012, FR-012a)', () => {
  const item = (id: string, slide = 1) => ({
    id,
    tipo: 'song',
    nome: `Item ${id}`,
    slide,
    totalDeSlides: 4,
  });

  function cicloCompleto(
    cor: Cor,
    itemLido: ReturnType<typeof item> | null,
    tema: { id: string; nome: string; tags: string[] } | null = null,
    momento = 1000,
  ): LeituraDoCiclo {
    return {
      momento,
      cor: { ok: true, valor: { regioes: [cor] } },
      item: { ok: true, valor: itemLido },
      tema: { ok: true, valor: tema },
    };
  }

  it('troca de item com cor parecida não anuncia cor (FR-012a)', () => {
    const s1 = aplicarCiclo(
      ESTADO_INICIAL,
      cicloCompleto(AZUL, item('s1')),
      PARÂMETROS,
    );

    // Música nova, tema de cor praticamente igual.
    const s2 = aplicarCiclo(
      s1.estado,
      cicloCompleto({ r: 2, g: 1, b: 252 }, item('s2'), null, 2000),
      PARÂMETROS,
    );

    expect(s2.eventos.map((e) => e.tipo)).toEqual(['item_trocado']);
    expect(s2.estado.corDeReferência).toEqual(AZUL);
  });

  it('encerrar a apresentação descarta a referência e a próxima cor vem como primeira leitura (FR-012)', () => {
    const comCor = aplicarCiclo(
      ESTADO_INICIAL,
      cicloCompleto(AZUL, item('s1')),
      PARÂMETROS,
    );

    const encerrada = aplicarCiclo(
      comCor.estado,
      cicloCompleto(AZUL, null, null, 2000),
      PARÂMETROS,
    );
    expect(encerrada.estado.corDeReferência).toBeNull();

    const voltou = aplicarCiclo(
      encerrada.estado,
      cicloCompleto(AZUL, item('s3'), null, 3000),
      PARÂMETROS,
    );

    const anúncio = voltou.eventos.find((e) => e.tipo === 'cor_anunciada');
    if (anúncio?.tipo !== 'cor_anunciada') throw new Error('faltou anúncio');
    expect(anúncio.motivo).toBe('primeira_leitura');
  });

  it('entrega os eventos do ciclo na ordem do contrato', () => {
    const comCor = aplicarCiclo(
      ESTADO_INICIAL,
      cicloCompleto(AZUL, item('s1'), { id: 't1', nome: 'Azul', tags: [] }),
      PARÂMETROS,
    );

    // Troca de item, tema e cor no mesmo ciclo, com N=1 para anunciar de uma vez.
    const tudoDeUmaVez = aplicarCiclo(
      comCor.estado,
      cicloCompleto(
        { r: 255, g: 0, b: 0 },
        item('s2'),
        { id: 't2', nome: 'Vermelho', tags: [] },
        2000,
      ),
      { ...PARÂMETROS, ciclosDeConfirmacao: 1 },
    );

    // Contexto antes de conteúdo: quem reage à cor já sabe em que item ela é.
    expect(tudoDeUmaVez.eventos.map((e) => e.tipo)).toEqual([
      'item_trocado',
      'tema_trocado',
      'cor_anunciada',
    ]);
  });

  it('o tema não influencia a decisão de cor (FR-005b)', () => {
    const comCor = aplicarCiclo(
      ESTADO_INICIAL,
      cicloCompleto(AZUL, item('s1'), { id: 't1', nome: 'Azul', tags: ['blue'] }),
      PARÂMETROS,
    );

    // Tema muda para um chamado "vermelho", mas a cor lida continua azul.
    const temaTrocado = aplicarCiclo(
      comCor.estado,
      cicloCompleto(AZUL, item('s1'), { id: 't2', nome: 'Vermelho', tags: ['red'] }, 2000),
      PARÂMETROS,
    );

    expect(temaTrocado.eventos.map((e) => e.tipo)).toEqual(['tema_trocado']);
    expect(temaTrocado.estado.corDeReferência).toEqual(AZUL);
  });
});

describe('último sucesso por consulta (FR-013a, FR-004a)', () => {
  it('avança o horário só da consulta que respondeu', () => {
    const primeiro = aplicarCiclo(ESTADO_INICIAL, ciclo(AZUL, 1000), PARÂMETROS);
    expect(primeiro.estado.últimoSucesso).toEqual({
      cor: 1000,
      item: 1000,
      tema: 1000,
    });

    // A cor continua respondendo; item e tema caíram.
    const parcial: LeituraDoCiclo = {
      momento: 5000,
      cor: { ok: true, valor: { regioes: [AZUL] } },
      item: { ok: false, motivo: 'indisponivel' },
      tema: { ok: false, motivo: 'indisponivel' },
    };

    const segundo = aplicarCiclo(primeiro.estado, parcial, PARÂMETROS);

    // É esta separação que permite distinguir "não mudou" de "não é lido há
    // dez minutos" durante uma falha parcial prolongada.
    expect(segundo.estado.últimoSucesso).toEqual({
      cor: 5000,
      item: 1000,
      tema: 1000,
    });
  });

  it('a cor segue sendo avaliada quando só a consulta de item falha', () => {
    const primeiro = aplicarCiclo(ESTADO_INICIAL, ciclo(AZUL, 1000), PARÂMETROS);

    const semItem: LeituraDoCiclo = {
      momento: 2000,
      cor: { ok: true, valor: { regioes: [{ r: 255, g: 0, b: 0 }] } },
      item: { ok: false, motivo: 'indisponivel' },
      tema: { ok: true, valor: null },
    };

    const comVermelho = aplicarCiclo(primeiro.estado, semItem, PARÂMETROS);
    const confirmando = aplicarCiclo(
      comVermelho.estado,
      { ...semItem, momento: 3000 },
      PARÂMETROS,
    );

    // Falha de consulta acessória não pode congelar o produto principal.
    expect(confirmando.eventos.some((e) => e.tipo === 'cor_anunciada')).toBe(true);
  });
});

describe('pureza do núcleo (Princípio II, SC-006)', () => {
  it('não modifica o estado recebido', () => {
    const antes = JSON.stringify(ESTADO_INICIAL);

    aplicarCiclo(ESTADO_INICIAL, ciclo(AZUL), PARÂMETROS);

    expect(JSON.stringify(ESTADO_INICIAL)).toBe(antes);
  });

  it('produz o mesmo resultado para a mesma entrada', () => {
    const a = aplicarCiclo(ESTADO_INICIAL, ciclo(AZUL), PARÂMETROS);
    const b = aplicarCiclo(ESTADO_INICIAL, ciclo(AZUL), PARÂMETROS);

    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Feature 003 — override de cor por tag do tema
// ---------------------------------------------------------------------------

const AZUL_MAPEADO: Cor = { r: 0, g: 40, b: 200 };
const CINZA: Cor = { r: 120, g: 120, b: 118 };
const MAPA = [{ tag: 'azul', cor: AZUL_MAPEADO }];
const COM_MAPA: ParâmetrosDoNúcleo = { ...PARÂMETROS, coresPorTag: MAPA };

const temaCom = (id: string, ...tags: string[]) => ({ id, nome: `Tema ${id}`, tags });

/** Ciclo com controle de tema, para os testes de override. */
function cicloComTema(
  cor: Cor,
  tema: { id: string; nome: string; tags: string[] } | null,
  momento = 1000,
): LeituraDoCiclo {
  return {
    momento,
    cor: { ok: true, valor: { regioes: [cor] } },
    item: { ok: true, valor: ITEM_PÚBLICO },
    tema: { ok: true, valor: tema },
  };
}

const ITEM_PÚBLICO: ItemEmExibição = {
  id: 'item-padrao',
  tipo: 'song',
  nome: 'Item de teste',
  slide: 1,
  totalDeSlides: 4,
};

const anúncioDe = (eventos: readonly { tipo: string }[]) =>
  eventos.find((e) => e.tipo === 'cor_anunciada') as
    | Extract<import('../../src/core/events.ts').Evento, { tipo: 'cor_anunciada' }>
    | undefined;

describe('a cor efetiva alimenta a decisão (T017, FR-008)', () => {
  it('com tema mapeado, anuncia a cor DECLARADA e não a extraída', () => {
    const { eventos, estado } = aplicarCiclo(
      ESTADO_INICIAL,
      cicloComTema(CINZA, temaCom('t1', 'azul')),
      COM_MAPA,
    );

    const a = anúncioDe(eventos);
    expect(a?.cor).toEqual(AZUL_MAPEADO);
    expect(estado.corDeReferência).toEqual(AZUL_MAPEADO);
  });

  it('o evento carrega origem, tag e a extraída descartada (FR-009, FR-015)', () => {
    const { eventos } = aplicarCiclo(
      ESTADO_INICIAL,
      cicloComTema(CINZA, temaCom('t1', 'azul')),
      COM_MAPA,
    );

    const a = anúncioDe(eventos);
    expect(a?.origem).toBe('mapeada');
    expect(a?.tag).toBe('azul');
    expect(a?.extraída).toEqual(CINZA);
  });

  it('sem tag mapeada, a origem é extraida e não há tag', () => {
    const { eventos } = aplicarCiclo(
      ESTADO_INICIAL,
      cicloComTema(CINZA, temaCom('t1', 'natal')),
      COM_MAPA,
    );

    const a = anúncioDe(eventos);
    expect(a?.cor).toEqual(CINZA);
    expect(a?.origem).toBe('extraida');
    expect(a?.tag).toBeNull();
  });
});

describe('sem a seção, nada muda (T020, FR-002, SC-003)', () => {
  it('produz exatamente os mesmos eventos e estado que sem a feature', () => {
    const leitura = cicloComTema(CINZA, temaCom('t1', 'azul'));

    const sem = aplicarCiclo(ESTADO_INICIAL, leitura, PARÂMETROS);
    const vazio = aplicarCiclo(ESTADO_INICIAL, leitura, { ...PARÂMETROS, coresPorTag: [] });

    expect(sem.estado).toEqual(vazio.estado);
    expect(sem.estado.corDeReferência).toEqual(CINZA);
    expect(anúncioDe(sem.eventos)?.origem).toBe('extraida');
  });
});

// ---------------------------------------------------------------------------
// US2 — o override vale quando a extração NÃO muda.
//
// RED não é esperado aqui: se o desenho estiver certo, estes testes passam de
// primeira, porque o comportamento EMERGE de a efetiva alimentar o limiar.
// Passarem confirma o desenho; falharem prova que a resolução entrou no lugar
// errado. Existem para que uma refatoração não desfaça a emergência em silêncio.
// ---------------------------------------------------------------------------

describe('US2: o override vale com a extração parada (T023, FR-010)', () => {
  it('a troca para tema mapeado anuncia a declarada mesmo sem a extração mudar', () => {
    // Ciclo 1: tema sem tag. A extraída vira referência.
    const c1 = aplicarCiclo(ESTADO_INICIAL, cicloComTema(CINZA, temaCom('t1'), 1000), COM_MAPA);
    expect(c1.estado.corDeReferência).toEqual(CINZA);

    // Ciclos 2 e 3: MESMA cor extraída, tema mapeado. Confirmação em 2 ciclos.
    const c2 = aplicarCiclo(c1.estado, cicloComTema(CINZA, temaCom('t2', 'azul'), 2000), COM_MAPA);
    const c3 = aplicarCiclo(c2.estado, cicloComTema(CINZA, temaCom('t2', 'azul'), 3000), COM_MAPA);

    expect(anúncioDe(c3.eventos)?.cor).toEqual(AZUL_MAPEADO);
    expect(anúncioDe(c3.eventos)?.origem).toBe('mapeada');
    expect(c3.estado.corDeReferência).toEqual(AZUL_MAPEADO);
  });
});

describe('US2: sair do override é tão observável quanto entrar (T024, FR-011)', () => {
  it('a extraída volta ao palco mesmo sem ter mudado desde antes do override', () => {
    let e = aplicarCiclo(ESTADO_INICIAL, cicloComTema(CINZA, temaCom('t1', 'azul'), 1000), COM_MAPA).estado;
    expect(e.corDeReferência).toEqual(AZUL_MAPEADO);

    // Tema sem tag, extração inalterada o tempo todo.
    const s2 = aplicarCiclo(e, cicloComTema(CINZA, temaCom('t9'), 2000), COM_MAPA);
    const s3 = aplicarCiclo(s2.estado, cicloComTema(CINZA, temaCom('t9'), 3000), COM_MAPA);

    expect(anúncioDe(s3.eventos)?.cor).toEqual(CINZA);
    expect(anúncioDe(s3.eventos)?.origem).toBe('extraida');
  });
});

describe('US2: dois temas mapeados para a MESMA cor (T025)', () => {
  it('não produzem anúncio nenhum — a cor resultante não mudou', () => {
    const doisMapas = {
      ...PARÂMETROS,
      coresPorTag: [
        { tag: 'azul', cor: AZUL_MAPEADO },
        { tag: 'ceu', cor: AZUL_MAPEADO },
      ],
    };

    const c1 = aplicarCiclo(ESTADO_INICIAL, cicloComTema(CINZA, temaCom('t1', 'azul'), 1000), doisMapas);
    const c2 = aplicarCiclo(c1.estado, cicloComTema(CINZA, temaCom('t2', 'ceu'), 2000), doisMapas);
    const c3 = aplicarCiclo(c2.estado, cicloComTema(CINZA, temaCom('t2', 'ceu'), 3000), doisMapas);

    expect(anúncioDe(c2.eventos)).toBeUndefined();
    expect(anúncioDe(c3.eventos)).toBeUndefined();
  });
});

describe('US2: o override é do TEMA, não do item nem do slide (T026, FR-013)', () => {
  it('trocar de item e de slide dentro do mesmo tema não muda a cor', () => {
    const tema = temaCom('t1', 'azul');
    const comItem = (id: string, slide: number, momento: number): LeituraDoCiclo => ({
      momento,
      cor: { ok: true, valor: { regioes: [CINZA] } },
      item: { ok: true, valor: { id, tipo: 'song', nome: id, slide, totalDeSlides: 4 } },
      tema: { ok: true, valor: tema },
    });

    let r = aplicarCiclo(ESTADO_INICIAL, comItem('m1', 1, 1000), COM_MAPA);
    expect(r.estado.corDeReferência).toEqual(AZUL_MAPEADO);

    for (const [id, slide, t] of [['m1', 2, 2000], ['m2', 1, 3000], ['m2', 3, 4000]] as const) {
      r = aplicarCiclo(r.estado, comItem(id, slide, t), COM_MAPA);
      expect(anúncioDe(r.eventos)).toBeUndefined();
      expect(r.estado.corDeReferência).toEqual(AZUL_MAPEADO);
    }
  });
});

// ---------------------------------------------------------------------------
// As duas fronteiras (FR-008a / FR-014a).
//
// Eram UMA condição antes desta feature e continuam vizinhas. Divergem de
// propósito, e é por isso que cada uma tem teste próprio.
// ---------------------------------------------------------------------------

const semItem = (tema: { id: string; nome: string; tags: string[] } | null): LeituraDoCiclo => ({
  momento: 1000,
  cor: { ok: true, valor: { regioes: [CINZA] } },
  item: { ok: true, valor: null },
  tema: { ok: true, valor: tema },
});

describe('FR-008a: o override vale sem leitura de cor (T028)', () => {
  it('anuncia a declarada quando a CONSULTA de cor falhou', () => {
    const r = aplicarCiclo(
      ESTADO_INICIAL,
      {
        momento: 1000,
        cor: { ok: false, motivo: 'indisponivel' },
        item: { ok: true, valor: ITEM_PÚBLICO },
        tema: { ok: true, valor: temaCom('t1', 'azul') },
      },
      COM_MAPA,
    );

    expect(anúncioDe(r.eventos)?.cor).toEqual(AZUL_MAPEADO);
    // Vazio é informação: a extração falhou, não coincidiu com a declarada.
    expect(anúncioDe(r.eventos)?.extraída).toBeNull();
  });

  it('anuncia a declarada quando a REGIÃO configurada não existe', () => {
    const r = aplicarCiclo(
      ESTADO_INICIAL,
      {
        momento: 1000,
        cor: { ok: true, valor: { regioes: [] } },
        item: { ok: true, valor: ITEM_PÚBLICO },
        tema: { ok: true, valor: temaCom('t1', 'azul') },
      },
      COM_MAPA,
    );

    expect(anúncioDe(r.eventos)?.cor).toEqual(AZUL_MAPEADO);
    expect(anúncioDe(r.eventos)?.extraída).toBeNull();
  });

  it('sem override E sem extração, nada é anunciado', () => {
    const r = aplicarCiclo(
      ESTADO_INICIAL,
      {
        momento: 1000,
        cor: { ok: false, motivo: 'indisponivel' },
        item: { ok: true, valor: ITEM_PÚBLICO },
        tema: { ok: true, valor: temaCom('t1', 'natal') },
      },
      COM_MAPA,
    );

    expect(anúncioDe(r.eventos)).toBeUndefined();
    expect(r.estado.corDeReferência).toBeNull();
  });
});

describe('FR-014a: sem apresentação, nada é anunciado (T030)', () => {
  it('NÃO anuncia a cor mapeada quando sabidamente não há apresentação', () => {
    const r = aplicarCiclo(ESTADO_INICIAL, semItem(temaCom('t1', 'azul')), COM_MAPA);

    // Anunciar aqui acenderia a luz exatamente quando a 002 decidiu não
    // comandar nada (002/FR-027).
    expect(anúncioDe(r.eventos)).toBeUndefined();
    expect(r.estado.corDeReferência).toBeNull();
  });

  it('encerrar a apresentação com tema mapeado não reacende nada', () => {
    const antes = aplicarCiclo(
      ESTADO_INICIAL,
      cicloComTema(CINZA, temaCom('t1', 'azul'), 1000),
      COM_MAPA,
    );
    expect(antes.estado.corDeReferência).toEqual(AZUL_MAPEADO);

    const depois = aplicarCiclo(antes.estado, semItem(temaCom('t1', 'azul')), COM_MAPA);

    expect(anúncioDe(depois.eventos)).toBeUndefined();
    // Sem apresentação a referência é descartada (FR-012 da 001).
    expect(depois.estado.corDeReferência).toBeNull();
  });
});

describe('o caso terceiro: consulta de ITEM falhou (T032)', () => {
  it('não é ausência SABIDA de apresentação, então o override vale', () => {
    const r = aplicarCiclo(
      ESTADO_INICIAL,
      {
        momento: 1000,
        cor: { ok: true, valor: { regioes: [CINZA] } },
        item: { ok: false, motivo: 'indisponivel' },
        tema: { ok: true, valor: temaCom('t1', 'azul') },
      },
      COM_MAPA,
    );

    expect(anúncioDe(r.eventos)?.cor).toEqual(AZUL_MAPEADO);
  });
});

describe('últimoSucesso.cor é registro de LEITURA, não de anúncio (T033)', () => {
  it('NÃO avança quando o override anunciou sem extração válida', () => {
    const r = aplicarCiclo(
      ESTADO_INICIAL,
      {
        momento: 5000,
        cor: { ok: false, motivo: 'indisponivel' },
        item: { ok: true, valor: ITEM_PÚBLICO },
        tema: { ok: true, valor: temaCom('t1', 'azul') },
      },
      COM_MAPA,
    );

    // Houve anúncio...
    expect(anúncioDe(r.eventos)).toBeDefined();
    // ...mas não houve leitura. Avançar aqui faria o diagnóstico de "há quanto
    // tempo o Holyrics não responde cor" mentir durante todo override.
    expect(r.estado.últimoSucesso.cor).toBeNull();
  });

  it('avança normalmente quando houve extração, mesmo sob override', () => {
    const r = aplicarCiclo(
      ESTADO_INICIAL,
      cicloComTema(CINZA, temaCom('t1', 'azul'), 7000),
      COM_MAPA,
    );

    expect(r.estado.últimoSucesso.cor).toBe(7000);
  });
});
