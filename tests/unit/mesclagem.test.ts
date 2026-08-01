/**
 * Mesclagem da submissão sobre o JSON bruto do disco (004/FR-023, FR-025).
 *
 * O ponto é o que o esquema **não** conhece. `zod` descarta chave desconhecida
 * em `safeParse`, então gravar o objeto validado apagaria comentários
 * estruturados, campos de features futuras e qualquer anotação posta à mão — em
 * silêncio, que é o modo de falha que este projeto persegue desde o `reg`/`red`
 * da 001.
 */

import { describe, expect, it } from 'vitest';
import { mesclarConfig } from '../../src/core/mesclagem.ts';
import {
  CHAVE_DESCONHECIDA_ANINHADA,
  CHAVE_DESCONHECIDA_DE_TOPO,
  configBruta,
} from '../fixtures/config-bruta.ts';

/**
 * As chaves de topo que o esquema conhece — o que a página é capaz de submeter.
 *
 * É o que separa "a página não sabe que isto existe" de "a página está
 * removendo isto de propósito". Sem a lista, apagar o bloco `freestyler` seria
 * indistinguível de omitir um comentário estruturado.
 */
const CONHECIDAS = [
  'holyrics',
  'leitura',
  'cor',
  'coresPorTag',
  'reconexao',
  'freestyler',
  'log',
  'painel',
] as const;

type Registro = Record<string, unknown>;

/** Submissão típica: só o que a página conhece. */
function submissão(): Registro {
  const b = configBruta();
  const semDesconhecidas = structuredClone(b);
  delete semDesconhecidas[CHAVE_DESCONHECIDA_DE_TOPO];
  delete (semDesconhecidas['holyrics'] as Registro)[CHAVE_DESCONHECIDA_ANINHADA];
  return semDesconhecidas;
}

describe('preserva o que a página não exibe (FR-025)', () => {
  it('chave desconhecida de topo sobrevive', () => {
    const r = mesclarConfig(configBruta(), submissão(), CONHECIDAS);

    expect(r[CHAVE_DESCONHECIDA_DE_TOPO]).toEqual(
      configBruta()[CHAVE_DESCONHECIDA_DE_TOPO],
    );
  });

  it('chave desconhecida ANINHADA sobrevive', () => {
    // Preservar só o topo é o meio-caminho que passa num teste ingênuo e perde
    // dado num arquivo real.
    const r = mesclarConfig(configBruta(), submissão(), CONHECIDAS);

    expect((r['holyrics'] as Registro)[CHAVE_DESCONHECIDA_ANINHADA]).toBe(
      'medido em 2026-07-28: 1,5 ms na LAN',
    );
  });

  it('o valor submetido vence o do disco no mesmo campo', () => {
    const s = submissão();
    (s['leitura'] as Registro)['regiao'] = 5;

    const r = mesclarConfig(configBruta(), s, CONHECIDAS);

    expect((r['leitura'] as Registro)['regiao']).toBe(5);
  });

  it('não inventa chave que nenhum dos dois lados tinha', () => {
    const r = mesclarConfig(configBruta(), submissão(), CONHECIDAS);

    expect(Object.keys(r).sort()).toEqual(Object.keys(configBruta()).sort());
  });
});

describe('array é substituído, nunca fundido (FR-025)', () => {
  it('remover uma entrada de coresPorTag REMOVE de verdade', () => {
    // Fundir posição a posição faria a remoção não remover nada: a terceira
    // entrada do disco sobreviveria a uma submissão com duas.
    const s = submissão();
    s['coresPorTag'] = [
      { tag: 'azul-escuro', cor: { r: 0, g: 20, b: 120 } },
      { tag: 'azul', cor: { r: 0, g: 40, b: 200 } },
    ];

    const r = mesclarConfig(configBruta(), s, CONHECIDAS);

    expect(r['coresPorTag']).toHaveLength(2);
    expect((r['coresPorTag'] as { tag: string }[]).map((m) => m.tag)).toEqual([
      'azul-escuro',
      'azul',
    ]);
  });

  it('esvaziar coresPorTag deixa a lista vazia, não a antiga', () => {
    const s = submissão();
    s['coresPorTag'] = [];

    expect(mesclarConfig(configBruta(), s, CONHECIDAS)['coresPorTag']).toEqual([]);
  });

  it('a ordem declarada na submissão sobrevive', () => {
    // A ordem É a regra de precedência (003/FR-007). Uma fusão que a alterasse
    // faria o override escolher outro vencedor sem que nada falhasse.
    const s = submissão();
    s['coresPorTag'] = [
      { tag: 'verde', cor: { r: 0, g: 160, b: 60 } },
      { tag: 'azul', cor: { r: 0, g: 40, b: 200 } },
      { tag: 'azul-escuro', cor: { r: 0, g: 20, b: 120 } },
    ];

    const r = mesclarConfig(configBruta(), s, CONHECIDAS);

    expect((r['coresPorTag'] as { tag: string }[]).map((m) => m.tag)).toEqual([
      'verde',
      'azul',
      'azul-escuro',
    ]);
  });
});

describe('blocos inteiros que entram e saem', () => {
  it('remover o bloco freestyler na submissão o remove do resultado', () => {
    // É a única forma de desligar a saída DMX (002/FR-008a). Preservá-lo por
    // "segurança" tornaria o desligamento impossível pela página.
    const s = submissão();
    delete s['freestyler'];

    expect(mesclarConfig(configBruta(), s, CONHECIDAS)).not.toHaveProperty('freestyler');
  });

  it('acrescentar um bloco novo na submissão o inclui', () => {
    const s = submissão();
    s['painel'] = { habilitado: true, host: '0.0.0.0', port: 13000 };

    expect(mesclarConfig(configBruta(), s, CONHECIDAS)['painel']).toEqual({
      habilitado: true,
      host: '0.0.0.0',
      port: 13000,
    });
  });
});

describe('campo novo dentro de um bloco existente', () => {
  it('a submissão pode acrescentar um campo que o disco não tinha', () => {
    // É o caso de uma feature futura: o campo entra pelo esquema, a página o
    // submete, e o arquivo ainda não o traz. Sem isto, o campo seria descartado
    // na gravação e a página confirmaria uma alteração que não aconteceu.
    const s = submissão();
    (s['freestyler'] as Registro)['campoNovoDaProximaFeature'] = 42;

    const r = mesclarConfig(configBruta(), s, CONHECIDAS);

    expect((r['freestyler'] as Registro)['campoNovoDaProximaFeature']).toBe(42);
    // E o que já existia continua lá.
    expect((r['freestyler'] as Registro)['grupo']).toBe('03: Par Led');
  });
});

describe('pureza (Princípio II)', () => {
  it('não altera nenhum dos dois argumentos', () => {
    const disco = configBruta();
    const enviada = submissão();
    const cópiaDoDisco = structuredClone(disco);
    const cópiaDaEnviada = structuredClone(enviada);

    mesclarConfig(disco, enviada, CONHECIDAS);

    expect(disco).toEqual(cópiaDoDisco);
    expect(enviada).toEqual(cópiaDaEnviada);
  });

  it('o resultado não compartilha referência com as entradas', () => {
    const disco = configBruta();
    const r = mesclarConfig(disco, submissão(), CONHECIDAS);

    (r['leitura'] as Registro)['regiao'] = 7;

    expect((disco['leitura'] as Registro)['regiao']).toBe(0);
  });
});
