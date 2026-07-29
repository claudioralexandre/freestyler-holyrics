import { describe, expect, it } from 'vitest';
import { precisaSelecionar, resolverGrupo } from '../../src/core/grupo.ts';
import { gruposDaInstalacao } from '../fixtures/freestyler-responses.ts';

describe('resolverGrupo (T008)', () => {
  it('casa o nome exato e devolve a posição 1-based', () => {
    const r = resolverGrupo('03: Par Led', gruposDaInstalacao);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.posição).toBe(3);
    expect(r.valor.nomeReal).toBe('03: Par Led');
  });

  it('ignora diferença de maiúsculas e minúsculas (FR-009b)', () => {
    const r = resolverGrupo('03: pAr lEd', gruposDaInstalacao);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.posição).toBe(3);
  });

  it('ignora espaços nas pontas (FR-009b)', () => {
    const r = resolverGrupo('   03: Par Led  ', gruposDaInstalacao);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.posição).toBe(3);
  });

  it('NÃO ignora acento — "Mov Chao" não acha "01: Mov Chão" (FR-009b)', () => {
    const r = resolverGrupo('01: Mov Chao', gruposDaInstalacao);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('nao_encontrado');
  });

  it('devolve os nomes existentes quando não acha, para o log ser acionável (FR-010)', () => {
    const r = resolverGrupo('Refletores do fundo', gruposDaInstalacao);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('nao_encontrado');
    expect(r.candidatos).toContain('03: Par Led');
    // As 19 posições vazias não são nomes e não devem poluir a mensagem.
    expect(r.candidatos).not.toContain('');
    expect(r.candidatos).toHaveLength(5);
  });

  it('recusa quando dois grupos casam sob a regra tolerante (FR-009c)', () => {
    const ambiguos = ['Par Led', 'par led  ', '', ''];

    const r = resolverGrupo('PAR LED', ambiguos);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('ambiguo');
    expect(r.candidatos).toHaveLength(2);
  });

  it('nunca casa com posição vazia, mesmo se o nome configurado for vazio', () => {
    const r = resolverGrupo('   ', gruposDaInstalacao);

    expect(r.ok).toBe(false);
  });

  it('não altera o array recebido', () => {
    const antes = JSON.stringify(gruposDaInstalacao);
    resolverGrupo('03: Par Led', gruposDaInstalacao);
    expect(JSON.stringify(gruposDaInstalacao)).toBe(antes);
  });
});

describe('precisaSelecionar — o comando de grupo é TOGGLE (T010)', () => {
  const status = (ativos: number[]): readonly boolean[] =>
    Array.from({ length: 24 }, (_, i) => ativos.includes(i + 1));

  it('NÃO envia quando o grupo já está ativo', () => {
    // Enviar aqui DESLIGARIA o grupo: o comando alterna, não seleciona.
    expect(precisaSelecionar(3, status([3]))).toBe(false);
  });

  it('envia quando o grupo está inativo', () => {
    expect(precisaSelecionar(3, status([]))).toBe(true);
  });

  it('envia quando outro grupo está ativo, e só o nosso (FR-012a-2)', () => {
    // A seleção é exclusiva: ativar o nosso já desativa o outro.
    expect(precisaSelecionar(3, status([4]))).toBe(true);
  });

  it('é idempotente: mesmo status, mesma resposta (FR-012a-1)', () => {
    const s = status([3]);
    expect(precisaSelecionar(3, s)).toBe(precisaSelecionar(3, s));

    const t = status([]);
    expect(precisaSelecionar(3, t)).toBe(precisaSelecionar(3, t));
  });

  it('trata status mais curto que a posição como inativo, sem estourar', () => {
    expect(precisaSelecionar(24, status([]).slice(0, 5))).toBe(true);
  });
});

describe('retentativa de resolução (T037, FR-011a)', () => {
  it('resolve de novo enquanto o grupo não for encontrado', () => {
    const semOGrupo = ['outro', '', ''];
    expect(resolverGrupo('03: Par Led', semOGrupo).ok).toBe(false);

    // O operador cria o grupo no Freestyler; a leitura seguinte já acha.
    const comOGrupo = ['outro', '', '03: Par Led'];
    const r = resolverGrupo('03: Par Led', comOGrupo);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.posição).toBe(3);
  });

  it('a posição acompanha o índice, mesmo com buracos antes', () => {
    const r = resolverGrupo('X', ['', '', '', 'X']);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.posição).toBe(4);
  });
});
