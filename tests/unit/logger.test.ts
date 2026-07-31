/**
 * Testes do conteúdo do log (T050).
 *
 * `logger.ts` é adaptador, onde o Princípio III torna o teste **opcional**. Estes
 * existem mesmo assim porque a 003 tem quatro requisitos que falam do conteúdo
 * de uma linha de log — FR-007b, FR-015, FR-016 e FR-017 — e dois critérios de
 * sucesso que só se verificam lendo o log: SC-004 e SC-005. Um requisito sobre
 * texto que ninguém verifica é um requisito que apodrece em silêncio.
 *
 * É o mesmo padrão de logger de captura que a 002 já usa em `saida-dmx.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import type { Logger } from 'pino';
import { registrarEvento, registrarLeitura } from '../../src/adapters/logger.ts';
import type { Evento } from '../../src/core/events.ts';
import type { Casamento } from '../../src/core/override.ts';
import type { Cor, LeituraDoCiclo, Tema } from '../../src/core/state.ts';

interface Linha {
  nível: 'info' | 'warn' | 'error' | 'debug';
  dados: Record<string, unknown>;
  mensagem: string;
}

function logCapturado(nívelDebug = false): { linhas: Linha[]; log: Logger } {
  const linhas: Linha[] = [];
  const registrar =
    (nível: Linha['nível']) =>
    (dados: Record<string, unknown>, mensagem: string): void => {
      linhas.push({ nível, dados, mensagem });
    };
  return {
    linhas,
    log: {
      info: registrar('info'),
      warn: registrar('warn'),
      error: registrar('error'),
      debug: registrar('debug'),
      isLevelEnabled: () => nívelDebug,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

const AZUL: Cor = { r: 0, g: 40, b: 200 };
const CINZA: Cor = { r: 120, g: 120, b: 118 };

const tema = (id: string, ...tags: string[]): Tema => ({ id, nome: `Tema ${id}`, tags });

const trocaDeTema = (casamento: Casamento, atual: Tema | null = tema('t1')): Evento => ({
  tipo: 'tema_trocado',
  momento: 1000,
  anterior: null,
  atual,
  casamento,
});

describe('origem da cor anunciada (FR-015, SC-004)', () => {
  it('com override, nomeia a tag e preserva a extraída descartada', () => {
    const { linhas, log } = logCapturado();

    registrarEvento(log, {
      tipo: 'cor_anunciada',
      momento: 1000,
      cor: AZUL,
      anterior: null,
      motivo: 'primeira_leitura',
      deltaE: null,
      origem: 'mapeada',
      tag: 'azul',
      extraída: CINZA,
    });

    const l = linhas[0] as Linha;
    expect(l.dados.origem).toBe('mapeada');
    expect(l.dados.tag).toBe('azul');
    expect(l.dados.extraída).toMatchObject({ r: 120, g: 120, b: 118 });
    // SC-004: dá para dizer de onde veio a cor lendo UMA linha, sem consultar
    // código nem configuração.
    expect(l.mensagem).toMatch(/azul/);
  });

  it('sem override, identifica como extraída e não menciona tag', () => {
    const { linhas, log } = logCapturado();

    registrarEvento(log, {
      tipo: 'cor_anunciada',
      momento: 1000,
      cor: CINZA,
      anterior: null,
      motivo: 'primeira_leitura',
      deltaE: null,
      origem: 'extraida',
      tag: null,
      extraída: CINZA,
    });

    const l = linhas[0] as Linha;
    expect(l.dados.origem).toBe('extraida');
    expect(l.dados.tag).toBeNull();
    expect(l.mensagem).not.toMatch(/tag/);
  });

  it('registra extraída NULA quando a extração falhou sob override (FR-008a)', () => {
    const { linhas, log } = logCapturado();

    registrarEvento(log, {
      tipo: 'cor_anunciada',
      momento: 1000,
      cor: AZUL,
      anterior: null,
      motivo: 'primeira_leitura',
      deltaE: null,
      origem: 'mapeada',
      tag: 'azul',
      extraída: null,
    });

    // Vazio é informação: a extração falhou naquele ciclo, o que é diferente de
    // ela ter coincidido com a declarada.
    expect((linhas[0] as Linha).dados.extraída).toBeNull();
  });
});

describe('veredito do tema (FR-017, FR-007b, SC-005)', () => {
  it('registra as tags observadas quando NENHUMA está mapeada', () => {
    const { linhas, log } = logCapturado();

    registrarEvento(log, trocaDeTema({ tipo: 'nenhuma_mapeada', tags: ['azuI', 'natal'] }));

    const aviso = linhas.find((l) => l.dados.tagsObservadas !== undefined);
    expect(aviso).toBeDefined();
    expect(aviso?.dados.tagsObservadas).toEqual(['azuI', 'natal']);
    // SC-005: a tag digitada diferente aparece em UMA troca de tema, sem depurar.
    expect(aviso?.mensagem).toMatch(/azuI/);
  });

  it('registra o empate nomeando a vencedora e as preteridas', () => {
    const { linhas, log } = logCapturado();

    registrarEvento(
      log,
      trocaDeTema({
        tipo: 'mapeada',
        tag: 'azul-escuro',
        cor: AZUL,
        preteridas: ['azul', 'natal'],
      }),
    );

    const empate = linhas.find((l) => l.dados.preteridas !== undefined);
    expect(empate).toBeDefined();
    expect(empate?.dados.tagVencedora).toBe('azul-escuro');
    expect(empate?.dados.preteridas).toEqual(['azul', 'natal']);
  });

  it('NÃO registra linha extra quando só uma tag casou', () => {
    const { linhas, log } = logCapturado();

    registrarEvento(
      log,
      trocaDeTema({ tipo: 'mapeada', tag: 'azul', cor: AZUL, preteridas: [] }),
    );

    // Uma linha só: a do tema. Sem empate, não há o que desempatar.
    expect(linhas).toHaveLength(1);
  });

  it('NÃO registra linha para tema SEM tag alguma', () => {
    const { linhas, log } = logCapturado();

    registrarEvento(log, trocaDeTema({ tipo: 'sem_tags' }));

    // É o estado normal de quem não usa a feature. Registrá-lo encheria de ruído
    // o log de todo culto.
    expect(linhas).toHaveLength(1);
  });

  it('NÃO registra linha quando não há mapeamento declarado', () => {
    const { linhas, log } = logCapturado();

    registrarEvento(log, trocaDeTema({ tipo: 'sem_mapeamento' }));

    expect(linhas).toHaveLength(1);
  });
});

describe('o ΔE da leitura declara quando NÃO mede ruído (T049, FR-009)', () => {
  const leitura = (cor: Cor): LeituraDoCiclo => ({
    momento: 1000,
    cor: { ok: true, valor: { regioes: [cor] } },
    item: { ok: true, valor: null },
    tema: { ok: true, valor: null },
  });

  it('marca deltaEMedeRuído como falso quando a referência é de override', () => {
    const { linhas, log } = logCapturado(true);

    registrarLeitura(log, leitura(CINZA), 0, AZUL, true);

    const l = linhas[0] as Linha;
    expect(l.dados.referênciaDeOverride).toBe(true);
    // Sem esta marca, quem calibrar o limiar lendo o ΔE conclui errado: o número
    // mede a distância até uma cor escolhida à mão, não a oscilação da extração.
    expect(l.dados.deltaEMedeRuído).toBe(false);
  });

  it('marca deltaEMedeRuído como verdadeiro no ciclo normal', () => {
    const { linhas, log } = logCapturado(true);

    registrarLeitura(log, leitura(CINZA), 0, CINZA, false);

    const l = linhas[0] as Linha;
    expect(l.dados.referênciaDeOverride).toBe(false);
    expect(l.dados.deltaEMedeRuído).toBe(true);
  });

  it('a cor extraída continua no log, que é o que se compara entre ciclos', () => {
    const { linhas, log } = logCapturado(true);

    registrarLeitura(log, leitura(CINZA), 0, AZUL, true);

    const regioes = (linhas[0] as Linha).dados.regioes as { escolhida: boolean; r: number }[];
    expect(regioes.find((r) => r.escolhida)?.r).toBe(120);
  });

  it('não registra nada quando o nível debug está desligado', () => {
    const { linhas, log } = logCapturado(false);

    registrarLeitura(log, leitura(CINZA), 0, AZUL, true);

    expect(linhas).toHaveLength(0);
  });
});
