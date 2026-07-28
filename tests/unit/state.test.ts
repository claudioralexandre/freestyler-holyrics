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
