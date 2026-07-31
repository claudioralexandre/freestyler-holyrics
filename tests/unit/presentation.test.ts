import { describe, expect, it } from 'vitest';
import { diferençaDeContexto } from '../../src/core/presentation.ts';
import { ESTADO_INICIAL } from '../../src/core/state.ts';
import type {
  EstadoDoServiço,
  ItemEmExibição,
  LeituraDoCiclo,
  Tema,
} from '../../src/core/state.ts';

function item(
  id: string,
  slide: number | null = 1,
  total: number | null = 4,
  nome = `Item ${id}`,
): ItemEmExibição {
  return { id, tipo: 'song', nome, slide, totalDeSlides: total };
}

function estadoCom(
  parcial: Partial<EstadoDoServiço>,
): EstadoDoServiço {
  return { ...ESTADO_INICIAL, ...parcial };
}

function leitura(
  itemLido: ItemEmExibição | null,
  temaLido: Tema | null = null,
  momento = 1000,
): LeituraDoCiclo {
  return {
    momento,
    cor: { ok: true, valor: { regioes: [{ r: 0, g: 0, b: 255 }] } },
    item: { ok: true, valor: itemLido },
    tema: { ok: true, valor: temaLido },
  };
}

const tiposDe = (r: { eventos: readonly { tipo: string }[] }) =>
  r.eventos.map((e) => e.tipo);

describe('troca de item (FR-010)', () => {
  it('emite item_trocado quando o id muda', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1') }),
      leitura(item('s2')),
    );

    expect(tiposDe(r)).toContain('item_trocado');
    const evento = r.eventos.find((e) => e.tipo === 'item_trocado');
    if (evento?.tipo !== 'item_trocado') throw new Error('faltou o evento');
    expect(evento.anterior.id).toBe('s1');
    expect(evento.atual.id).toBe('s2');
  });

  it('não emite nada quando item e slide são os mesmos', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1', 2) }),
      leitura(item('s1', 2)),
    );

    expect(r.eventos).toHaveLength(0);
  });

  it('não emite slide_mudou junto da troca de item (FR-010c)', () => {
    // O item novo entra num slide diferente, mas isso não é "avanço de slide".
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1', 3) }),
      leitura(item('s2', 1)),
    );

    expect(tiposDe(r)).toContain('item_trocado');
    expect(tiposDe(r)).not.toContain('slide_mudou');
  });

  it('não descarta a cor de referência ao trocar de item (FR-012a)', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1'), corDeReferência: { r: 0, g: 0, b: 255 } }),
      leitura(item('s2')),
    );

    expect(r.descartarCor).toBe(false);
  });
});

describe('mudança de slide (FR-010a)', () => {
  it('emite slide_mudou ao avançar dentro do mesmo item', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1', 1) }),
      leitura(item('s1', 2)),
    );

    expect(tiposDe(r)).toEqual(['slide_mudou']);
    const evento = r.eventos[0];
    if (evento?.tipo !== 'slide_mudou') throw new Error('faltou o evento');
    expect(evento.de).toBe(1);
    expect(evento.para).toBe(2);
    expect(evento.total).toBe(4);
  });

  it('emite slide_mudou ao retroceder', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1', 3) }),
      leitura(item('s1', 2)),
    );

    const evento = r.eventos[0];
    if (evento?.tipo !== 'slide_mudou') throw new Error('faltou o evento');
    expect(evento.de).toBe(3);
    expect(evento.para).toBe(2);
  });

  it('emite um evento por salto, mesmo quando o operador pula várias estrofes', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1', 1) }),
      leitura(item('s1', 5)),
    );

    expect(r.eventos).toHaveLength(1);
    const evento = r.eventos[0];
    if (evento?.tipo !== 'slide_mudou') throw new Error('faltou o evento');
    // Não inventa os passos intermediários que a leitura periódica não viu.
    expect(evento.de).toBe(1);
    expect(evento.para).toBe(5);
  });

  it('não emite slide_mudou para item sem noção de slide', () => {
    const imagem = item('img1', null, null, 'aviso.png');

    const r = diferençaDeContexto(
      estadoCom({ item: imagem }),
      leitura({ ...imagem }),
    );

    expect(r.eventos).toHaveLength(0);
  });

  it('não emite evento quando só o total de slides muda', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1', 2, 4) }),
      leitura(item('s1', 2, 6)),
    );

    expect(r.eventos).toHaveLength(0);
    expect(r.item?.totalDeSlides).toBe(6);
  });
});

describe('início e fim de apresentação (FR-011, FR-012)', () => {
  it('emite apresentacao_iniciada ao sair de "sem apresentação"', () => {
    const r = diferençaDeContexto(estadoCom({ item: null }), leitura(item('s1')));

    expect(tiposDe(r)).toEqual(['apresentacao_iniciada']);
  });

  it('não emite item_trocado ao iniciar, pois não havia item anterior', () => {
    const r = diferençaDeContexto(estadoCom({ item: null }), leitura(item('s1')));

    expect(tiposDe(r)).not.toContain('item_trocado');
  });

  it('emite apresentacao_encerrada quando a apresentação some', () => {
    const r = diferençaDeContexto(estadoCom({ item: item('s1') }), leitura(null));

    expect(tiposDe(r)).toEqual(['apresentacao_encerrada']);
  });

  it('descarta a cor de referência ao encerrar (FR-012)', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1'), corDeReferência: { r: 0, g: 0, b: 255 } }),
      leitura(null),
    );

    expect(r.descartarCor).toBe(true);
  });

  it('permanece em silêncio enquanto não há apresentação alguma', () => {
    const r = diferençaDeContexto(estadoCom({ item: null }), leitura(null));

    expect(r.eventos).toHaveLength(0);
    expect(r.descartarCor).toBe(false);
  });
});

describe('tema (FR-005a, FR-005b)', () => {
  const azul: Tema = { id: 't1', nome: 'Azul', tags: ['blue'] };
  const vermelho: Tema = { id: 't2', nome: 'Vermelho', tags: ['red'] };

  it('emite tema_trocado quando o tema muda', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1'), tema: azul }),
      leitura(item('s1'), vermelho),
    );

    expect(tiposDe(r)).toContain('tema_trocado');
  });

  it('não emite nada quando o tema permanece', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1'), tema: azul }),
      leitura(item('s1'), azul),
    );

    expect(r.eventos).toHaveLength(0);
  });

  it('nunca descarta a cor de referência por causa do tema (FR-005b)', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1'), tema: azul, corDeReferência: { r: 1, g: 2, b: 3 } }),
      leitura(item('s1'), vermelho),
    );

    expect(r.descartarCor).toBe(false);
  });

  it('tema ausente não impede a leitura nem gera falha (FR-005c)', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1'), tema: azul }),
      leitura(item('s1'), null),
    );

    expect(r.tema).toBeNull();
    expect(tiposDe(r)).toContain('tema_trocado');
  });
});

describe('consultas que falharam preservam o valor anterior (FR-004a)', () => {
  it('mantém o item quando a consulta de item falha', () => {
    const anterior = item('s1', 2);
    const falhou: LeituraDoCiclo = {
      momento: 2000,
      cor: { ok: true, valor: { regioes: [{ r: 0, g: 0, b: 255 }] } },
      item: { ok: false, motivo: 'resposta_invalida' },
      tema: { ok: true, valor: null },
    };

    const r = diferençaDeContexto(estadoCom({ item: anterior }), falhou);

    expect(r.item).toEqual(anterior);
    // Não inventa "apresentação encerrada" a partir de uma falha de consulta.
    expect(r.eventos).toHaveLength(0);
    expect(r.descartarCor).toBe(false);
  });

  it('mantém o tema quando a consulta de tema falha', () => {
    const tema: Tema = { id: 't1', nome: 'Azul', tags: [] };
    const falhou: LeituraDoCiclo = {
      momento: 2000,
      cor: { ok: true, valor: { regioes: [{ r: 0, g: 0, b: 255 }] } },
      item: { ok: true, valor: item('s1') },
      tema: { ok: false, motivo: 'indisponivel' },
    };

    const r = diferençaDeContexto(estadoCom({ item: item('s1'), tema }), falhou);

    expect(r.tema).toEqual(tema);
  });
});

describe('casamento junto do tema (T015, feature 003)', () => {
  const AZUL = { r: 0, g: 40, b: 200 };
  const mapa = [{ tag: 'azul', cor: AZUL }];
  const temaCom = (...tags: string[]): Tema => ({ id: 'tm1', nome: 'Tema 9', tags });

  it('devolve o veredito do tema que ENTROU, calculado uma vez só', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1'), tema: null }),
      leitura(item('s1'), temaCom('azul')),
      mapa,
    );

    expect(r.casamento.tipo).toBe('mapeada');
    if (r.casamento.tipo !== 'mapeada') return;
    expect(r.casamento.cor).toEqual(AZUL);
  });

  it('devolve nenhuma_mapeada com as tags observadas, para o diagnóstico', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1') }),
      leitura(item('s1'), temaCom('azuI')),
      mapa,
    );

    expect(r.casamento.tipo).toBe('nenhuma_mapeada');
  });

  it('sem mapeamentos declarados, o veredito é sem_mapeamento', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1') }),
      leitura(item('s1'), temaCom('azul')),
    );

    expect(r.casamento.tipo).toBe('sem_mapeamento');
  });

  it('avalia o tema PRESERVADO quando a consulta de tema falhou', () => {
    // Perder a leitura não é perder o tema: o override sobrevive à falha.
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1'), tema: temaCom('azul') }),
      {
        momento: 1000,
        cor: { ok: true, valor: { regioes: [{ r: 0, g: 0, b: 255 }] } },
        item: { ok: true, valor: item('s1') },
        tema: { ok: false, motivo: 'indisponivel' },
      },
      mapa,
    );

    expect(r.casamento.tipo).toBe('mapeada');
  });

  it('sem tema, o veredito é sem_tema', () => {
    const r = diferençaDeContexto(
      estadoCom({ item: item('s1') }),
      leitura(item('s1'), null),
      mapa,
    );

    expect(r.casamento.tipo).toBe('sem_tema');
  });
});
