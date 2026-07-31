import { describe, expect, it } from 'vitest';
import {
  casarTag,
  normalizarTag,
  referênciaÉDeOverride,
  resolverCorEfetiva,
} from '../../src/core/override.ts';
import type { MapeamentoDeTag } from '../../src/core/override.ts';
import type { Cor, Tema } from '../../src/core/state.ts';
import { CAFÉ, CORAÇÃO, SEM_ACENTO_VS_COM, ehParDistinto } from '../fixtures/tags-unicode.ts';

const AZUL: Cor = { r: 0, g: 40, b: 200 };
const AZUL_ESCURO: Cor = { r: 0, g: 20, b: 120 };
const VERMELHO: Cor = { r: 200, g: 0, b: 0 };
const EXTRAÍDA: Cor = { r: 90, g: 90, b: 90 };

const tema = (...tags: string[]): Tema => ({ id: 't1', nome: 'Tema 9', tags });

const mapa = (...pares: [string, Cor][]): MapeamentoDeTag[] =>
  pares.map(([tag, cor]) => ({ tag, cor }));

describe('normalizarTag (T003, FR-006, FR-006a)', () => {
  it('ignora a caixa', () => {
    expect(normalizarTag('Azul')).toBe(normalizarTag('azul'));
    expect(normalizarTag('AZUL')).toBe(normalizarTag('azul'));
  });

  it('ignora espaço nas pontas', () => {
    expect(normalizarTag('  azul  ')).toBe(normalizarTag('azul'));
  });

  it('casa as duas grafias Unicode do mesmo acento', () => {
    // Guarda: se o ambiente já tivesse normalizado o par, o teste não exercitaria
    // nada e passaria de graça.
    expect(ehParDistinto(CAFÉ)).toBe(true);
    expect(ehParDistinto(CORAÇÃO)).toBe(true);

    expect(normalizarTag(CAFÉ.composta)).toBe(normalizarTag(CAFÉ.decomposta));
    expect(normalizarTag(CORAÇÃO.composta)).toBe(normalizarTag(CORAÇÃO.decomposta));
  });

  it('NÃO casa quando o acento some — acento conta (FR-006)', () => {
    expect(normalizarTag(SEM_ACENTO_VS_COM.semAcento)).not.toBe(
      normalizarTag(SEM_ACENTO_VS_COM.comAcento),
    );
  });

  it('o espaço INTERNO conta', () => {
    expect(normalizarTag('azul escuro')).not.toBe(normalizarTag('azulescuro'));
  });
});

describe('casarTag — os cinco casos (T005, FR-005)', () => {
  it('sem_mapeamento quando a lista está vazia', () => {
    expect(casarTag(tema('azul'), []).tipo).toBe('sem_mapeamento');
  });

  it('sem_tema quando não há tema', () => {
    expect(casarTag(null, mapa(['azul', AZUL])).tipo).toBe('sem_tema');
  });

  it('sem_tags quando o tema não tem tag alguma', () => {
    // É o estado normal de quem não usa a feature: não vira log.
    expect(casarTag(tema(), mapa(['azul', AZUL])).tipo).toBe('sem_tags');
  });

  it('nenhuma_mapeada traz as tags observadas, para o diagnóstico (FR-017)', () => {
    const r = casarTag(tema('azuI', 'natal'), mapa(['azul', AZUL]));

    expect(r.tipo).toBe('nenhuma_mapeada');
    if (r.tipo !== 'nenhuma_mapeada') return;
    expect(r.tags).toEqual(['azuI', 'natal']);
  });

  it('mapeada devolve a tag e a cor declarada', () => {
    const r = casarTag(tema('azul'), mapa(['azul', AZUL]));

    expect(r.tipo).toBe('mapeada');
    if (r.tipo !== 'mapeada') return;
    expect(r.cor).toEqual(AZUL);
    expect(r.preteridas).toEqual([]);
  });

  it('casa sob a regra de comparação, não por igualdade estrita', () => {
    const r = casarTag(tema('  AZUL  '), mapa(['azul', AZUL]));

    expect(r.tipo).toBe('mapeada');
  });

  it('casa as duas grafias Unicode entre configuração e tema (FR-006a)', () => {
    const r = casarTag(tema(CAFÉ.decomposta), mapa([CAFÉ.composta, VERMELHO]));

    expect(r.tipo).toBe('mapeada');
    if (r.tipo !== 'mapeada') return;
    expect(r.cor).toEqual(VERMELHO);
  });
});

describe('casarTag — precedência (T006, FR-007, FR-007a)', () => {
  it('vence a primeira DECLARADA, não a primeira tag do tema', () => {
    const r = casarTag(tema('azul', 'azul-escuro'), mapa(['azul-escuro', AZUL_ESCURO], ['azul', AZUL]));

    expect(r.tipo).toBe('mapeada');
    if (r.tipo !== 'mapeada') return;
    expect(r.tag).toBe('azul-escuro');
    expect(r.cor).toEqual(AZUL_ESCURO);
  });

  it('inverter a configuração inverte o vencedor', () => {
    const r = casarTag(tema('azul', 'azul-escuro'), mapa(['azul', AZUL], ['azul-escuro', AZUL_ESCURO]));

    expect(r.tipo).toBe('mapeada');
    if (r.tipo !== 'mapeada') return;
    expect(r.tag).toBe('azul');
  });

  it('a ordem das tags DENTRO do tema não influencia', () => {
    const config = mapa(['azul-escuro', AZUL_ESCURO], ['azul', AZUL]);

    const a = casarTag(tema('azul', 'azul-escuro'), config);
    const b = casarTag(tema('azul-escuro', 'azul'), config);

    expect(a).toEqual(b);
  });

  it('preteridas traz as demais mapeadas, para o log de empate (FR-007b)', () => {
    const r = casarTag(
      tema('azul', 'natal', 'azul-escuro'),
      mapa(['azul-escuro', AZUL_ESCURO], ['azul', AZUL], ['natal', VERMELHO]),
    );

    expect(r.tipo).toBe('mapeada');
    if (r.tipo !== 'mapeada') return;
    expect(r.tag).toBe('azul-escuro');
    // Na ordem da configuração, não na ordem do tema.
    expect(r.preteridas).toEqual(['azul', 'natal']);
  });

  it('tag só de dígitos declarada DEPOIS não salta para a frente (FR-007a)', () => {
    // É o caso que um objeto JSON quebraria em silêncio: "2024" viraria índice
    // canônico e passaria na frente de "azul".
    const r = casarTag(tema('2024', 'azul'), mapa(['azul', AZUL], ['2024', VERMELHO]));

    expect(r.tipo).toBe('mapeada');
    if (r.tipo !== 'mapeada') return;
    expect(r.tag).toBe('azul');
  });
});

describe('resolverCorEfetiva (T009, FR-008, FR-008a, FR-009)', () => {
  const mapeada = casarTag(tema('azul'), mapa(['azul', AZUL]));
  const semMapa = casarTag(tema('azul'), []);

  it('com override devolve a cor declarada e preserva a extraída', () => {
    const r = resolverCorEfetiva(EXTRAÍDA, mapeada);

    expect(r).not.toBeNull();
    expect(r?.cor).toEqual(AZUL);
    expect(r?.origem).toBe('mapeada');
    expect(r?.tag).toBe('azul');
    // FR-009: é o que permite julgar depois se o override ainda é necessário.
    expect(r?.extraída).toEqual(EXTRAÍDA);
  });

  it('sem override devolve a extraída, com origem extraida', () => {
    const r = resolverCorEfetiva(EXTRAÍDA, semMapa);

    expect(r?.cor).toEqual(EXTRAÍDA);
    expect(r?.origem).toBe('extraida');
    expect(r?.tag).toBeNull();
    expect(r?.extraída).toEqual(EXTRAÍDA);
  });

  it('com override e SEM extração devolve a declarada, com extraída nula (FR-008a)', () => {
    const r = resolverCorEfetiva(null, mapeada);

    expect(r?.cor).toEqual(AZUL);
    expect(r?.origem).toBe('mapeada');
    // Vazio é informação: diz que a extração falhou, não que ela coincidiu.
    expect(r?.extraída).toBeNull();
  });

  it('sem override e sem extração devolve null — não há o que anunciar', () => {
    expect(resolverCorEfetiva(null, semMapa)).toBeNull();
  });

  it('com origem extraida, a extraída NUNCA é nula', () => {
    const r = resolverCorEfetiva(EXTRAÍDA, semMapa);

    expect(r?.origem).toBe('extraida');
    expect(r?.extraída).not.toBeNull();
  });
});

describe('referênciaÉDeOverride (T049, FR-009)', () => {
  const mapeadaAzul = casarTag(tema('azul'), mapa(['azul', AZUL]));
  const semTag = casarTag(tema('natal'), mapa(['azul', AZUL]));

  it('é verdadeiro quando a referência É a cor declarada do tema atual', () => {
    expect(referênciaÉDeOverride(AZUL, mapeadaAzul)).toBe(true);
  });

  it('é falso quando o tema está mapeado mas a referência ainda é outra cor', () => {
    // Acontece entre a troca de tema e a confirmação por permanência: o tema já
    // casa, mas o palco ainda está na cor anterior.
    expect(referênciaÉDeOverride(EXTRAÍDA, mapeadaAzul)).toBe(false);
  });

  it('é falso sem tema mapeado, mesmo que a referência coincida por acaso', () => {
    expect(referênciaÉDeOverride(AZUL, semTag)).toBe(false);
  });

  it('é falso sem referência alguma', () => {
    expect(referênciaÉDeOverride(null, mapeadaAzul)).toBe(false);
  });
});
