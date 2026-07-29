import { describe, expect, it } from 'vitest';
import {
  CODIGO,
  comandoDeCor,
  comandoDeGrupo,
  consulta,
  decodificarResposta,
  ehHeartbeat,
} from '../../src/adapters/freestyler/protocolo.ts';
import {
  heartbeat,
  respostaEnderecos,
  respostaFixtures,
  respostaGrupos,
  respostaSemSeparador,
  respostaStatusGrupo3Ativo,
  respostaTruncada,
  respostaVersao,
} from '../fixtures/freestyler-responses.ts';

describe('codificação FSOC (T003)', () => {
  it('preenche código e argumento com zero à esquerda em 3 casas', () => {
    // Observado: FSOC002255 alterna o blackout.
    expect(comandoDeGrupo(1)).toBe('FSOC034255');
  });

  it('mapeia os grupos 1 a 10 para os códigos 34 a 43', () => {
    expect(comandoDeGrupo(1)).toBe('FSOC034255');
    expect(comandoDeGrupo(3)).toBe('FSOC036255');
    expect(comandoDeGrupo(10)).toBe('FSOC043255');
  });

  it('mapeia os grupos 11 a 24 para os códigos 550 a 563', () => {
    expect(comandoDeGrupo(11)).toBe('FSOC550255');
    expect(comandoDeGrupo(24)).toBe('FSOC563255');
  });

  it('recusa posição de grupo fora de 1–24', () => {
    expect(() => comandoDeGrupo(0)).toThrow();
    expect(() => comandoDeGrupo(25)).toThrow();
  });

  it('escreve os três slots de cor com o valor em 3 casas', () => {
    // Verificado contra par LED RGB: 130 é vermelho, 131 verde, 132 azul.
    expect(comandoDeCor({ r: 255, g: 0, b: 36 })).toBe('FSOC130255FSOC131000FSOC132036');
  });

  it('escreve preto como três zeros, não como ausência de comando', () => {
    expect(comandoDeCor({ r: 0, g: 0, b: 0 })).toBe('FSOC130000FSOC131000FSOC132000');
  });

  it('monta consultas FSBC com o sufixo 000', () => {
    expect(consulta(CODIGO.nomesDeGrupos)).toBe('FSBC008000');
    expect(consulta(CODIGO.statusDeGrupos)).toBe('FSBC009000');
    expect(consulta(CODIGO.versao)).toBe('FSBC010000');
  });
});

describe('decodificação FSBC (T005)', () => {
  it('lê um valor único', () => {
    const r = decodificarResposta(respostaVersao);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.campos).toEqual(['4.1.7']);
  });

  it('lê a lista de nomes de grupos preservando as posições vazias', () => {
    const r = decodificarResposta(respostaGrupos);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.campos[0]).toBe('01: Mov Chão');
    expect(r.valor.campos[2]).toBe('03: Par Led');
    expect(r.valor.campos[5]).toBe('');
  });

  it('IGNORA o byte de contagem, que não é confiável', () => {
    // Observado em 4.1.7: grupos vêm com byte 23 e 24 campos; status com byte
    // 24 e 25 campos; fixtures batem. Fatiar pelo byte produziria erro de um
    // exatamente onde importa — a posição do grupo.
    const grupos = decodificarResposta(respostaGrupos);
    const fixtures = decodificarResposta(respostaFixtures);

    expect(grupos.ok && grupos.valor.campos.length).toBe(24);
    expect(fixtures.ok && fixtures.valor.campos.length).toBe(15);
  });

  it('lê a posição do grupo ativo por índice, base zero', () => {
    const r = decodificarResposta(respostaStatusGrupo3Ativo);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // "03: Par Led" é a posição 3, logo o índice 2.
    expect(r.valor.campos[2]).toBe('1');
    expect(r.valor.campos[0]).toBe('0');
  });

  it('lê lista de inteiros', () => {
    const r = decodificarResposta(respostaEnderecos);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.campos.slice(0, 4)).toEqual(['1', '4', '7', '10']);
  });

  it('recusa resposta truncada sem lançar', () => {
    const r = decodificarResposta(respostaTruncada);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('resposta_invalida');
  });

  it('recusa resposta fora do formato sem lançar', () => {
    const r = decodificarResposta(respostaSemSeparador);

    expect(r.ok).toBe(false);
  });
});

describe('heartbeat não é resposta (T007)', () => {
  it('reconhece o pulso 0xFF', () => {
    expect(ehHeartbeat(heartbeat)).toBe(true);
  });

  it('não confunde uma resposta de consulta com pulso', () => {
    expect(ehHeartbeat(respostaVersao)).toBe(false);
    expect(ehHeartbeat(respostaGrupos)).toBe(false);
  });

  it('não trata o pulso como resposta decodificável', () => {
    const r = decodificarResposta(heartbeat);

    expect(r.ok).toBe(false);
  });
});
