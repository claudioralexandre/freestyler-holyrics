/**
 * O núcleo da recarga a quente (004/FR-018, FR-019, FR-021, FR-021a).
 *
 * Duas funções puras. A primeira diz **o que mudou**, a segunda diz **o que isso
 * obriga a fazer**. Separadas porque a primeira é mecânica e a segunda é
 * decisão — e é a segunda que precisa ser lida linha a linha contra a spec.
 *
 * Nada aqui conhece o tipo `Config`: o diff opera sobre registros genéricos, e é
 * isso que mantém `core/` sem importar de `adapters/`.
 */

import { describe, expect, it } from 'vitest';
import { camposAlterados, efeitosDe } from '../../src/core/recarga.ts';
import { configBruta } from '../fixtures/config-bruta.ts';

type Registro = Record<string, unknown>;

/** Cópia profunda, para que alterar o clone não contamine o original. */
function clone(o: Registro): Registro {
  return structuredClone(o);
}

describe('camposAlterados: o que mudou (004/T014)', () => {
  it('dois objetos iguais devolvem lista vazia', () => {
    expect(camposAlterados(configBruta(), configBruta())).toEqual([]);
  });

  it('detecta mudança aninhada, com o caminho completo', () => {
    const depois = clone(configBruta());
    (depois['leitura'] as Registro)['regiao'] = 3;

    expect(camposAlterados(configBruta(), depois)).toEqual(['leitura.regiao']);
  });

  it('detecta duas mudanças em blocos diferentes', () => {
    const depois = clone(configBruta());
    (depois['cor'] as Registro)['limiarDeltaE'] = 5;
    (depois['log'] as Registro)['nivel'] = 'debug';

    expect([...camposAlterados(configBruta(), depois)].sort()).toEqual([
      'cor.limiarDeltaE',
      'log.nivel',
    ]);
  });

  it('detecta chave que apareceu', () => {
    const depois = clone(configBruta());
    (depois['painel'] as unknown) = { habilitado: false };

    expect(camposAlterados(configBruta(), depois)).toEqual(['painel']);
  });

  it('detecta chave que sumiu', () => {
    const depois = clone(configBruta());
    delete depois['coresPorTag'];

    expect(camposAlterados(configBruta(), depois)).toEqual(['coresPorTag']);
  });

  it('trata coresPorTag como UM campo, não um por entrada', () => {
    // A ordem do array é a regra de precedência (003/FR-007). Um diff por
    // posição produziria `coresPorTag.0.tag`, `coresPorTag.1.tag`… e a tabela de
    // efeitos teria que adivinhar o que fazer com cada um.
    const depois = clone(configBruta());
    (depois['coresPorTag'] as unknown[]).splice(1, 1);

    expect(camposAlterados(configBruta(), depois)).toEqual(['coresPorTag']);
  });

  it('reordenar coresPorTag conta como mudança', () => {
    const depois = clone(configBruta());
    const lista = depois['coresPorTag'] as unknown[];
    depois['coresPorTag'] = [lista[1], lista[0], lista[2]];

    expect(camposAlterados(configBruta(), depois)).toEqual(['coresPorTag']);
  });

  it('detecta o bloco freestyler saindo inteiro', () => {
    const depois = clone(configBruta());
    delete depois['freestyler'];

    expect(camposAlterados(configBruta(), depois)).toEqual(['freestyler']);
  });

  it('detecta o bloco freestyler entrando inteiro', () => {
    const antes = clone(configBruta());
    delete antes['freestyler'];

    expect(camposAlterados(antes, configBruta())).toEqual(['freestyler']);
  });

  it('bloco presente nos dois lados dá o caminho do campo, não do bloco', () => {
    const depois = clone(configBruta());
    (depois['freestyler'] as Registro)['grupo'] = '05: Outro';

    expect(camposAlterados(configBruta(), depois)).toEqual(['freestyler.grupo']);
  });

  it('mudança dentro de um objeto de cor dá o caminho até o componente', () => {
    const depois = clone(configBruta());
    ((depois['freestyler'] as Registro)['corDeRepouso'] as Registro)['r'] = 255;

    expect(camposAlterados(configBruta(), depois)).toEqual([
      'freestyler.corDeRepouso.r',
    ]);
  });
});

describe('efeitosDe: o que a mudança obriga a fazer (004/T016)', () => {
  const efeitos = (...caminhos: string[]) => new Set(efeitosDe(caminhos));

  it('leitura.intervaloMs muda só o ritmo', () => {
    expect(efeitos('leitura.intervaloMs')).toEqual(new Set(['ritmo_de_leitura']));
  });

  it('cor.limiarDeltaE e cor.ciclosDeConfirmacao só trocam parâmetros do núcleo', () => {
    expect(efeitos('cor.limiarDeltaE')).toEqual(new Set(['parametros_do_nucleo']));
    expect(efeitos('cor.ciclosDeConfirmacao')).toEqual(
      new Set(['parametros_do_nucleo']),
    );
  });

  it('coresPorTag só troca parâmetros do núcleo', () => {
    expect(efeitos('coresPorTag')).toEqual(new Set(['parametros_do_nucleo']));
  });

  it('holyrics.* manda reconectar o Holyrics e nada mais', () => {
    expect(efeitos('holyrics.host')).toEqual(new Set(['reconectar_holyrics']));
    expect(efeitos('holyrics.port')).toEqual(new Set(['reconectar_holyrics']));
    expect(efeitos('holyrics.requestTimeoutMs')).toEqual(
      new Set(['reconectar_holyrics']),
    );
  });

  it('endereço do Freestyler manda reconectar só o Freestyler', () => {
    expect(efeitos('freestyler.host')).toEqual(new Set(['reconectar_freestyler']));
    expect(efeitos('freestyler.port')).toEqual(new Set(['reconectar_freestyler']));
  });

  it('nome do grupo manda reresolver, sem reconectar', () => {
    // Reconectar aqui seria efeito colateral em componente que não depende do
    // campo alterado (FR-018), e custaria uma queda de socket por um rename.
    expect(efeitos('freestyler.grupo')).toEqual(new Set(['reresolver_grupo']));
  });

  it('corDeRepouso e prazos trocam parâmetros da saída', () => {
    expect(efeitos('freestyler.corDeRepouso.r')).toEqual(
      new Set(['parametros_da_saida']),
    );
    expect(efeitos('freestyler.heartbeatTimeoutMs')).toEqual(
      new Set(['parametros_da_saida']),
    );
    expect(efeitos('freestyler.consultaTimeoutMs')).toEqual(
      new Set(['parametros_da_saida']),
    );
  });

  it('o bloco freestyler inteiro manda religar a saída', () => {
    expect(efeitos('freestyler')).toEqual(new Set(['religar_saida']));
  });

  it('log.* manda reconfigurar o log', () => {
    expect(efeitos('log.nivel')).toEqual(new Set(['reconfigurar_log']));
    expect(efeitos('log.arquivo')).toEqual(new Set(['reconfigurar_log']));
  });

  it('painel.* manda re-servir o painel', () => {
    expect(efeitos('painel.port')).toEqual(new Set(['re_servir_painel']));
    expect(efeitos('painel')).toEqual(new Set(['re_servir_painel']));
  });

  it('reconexao.* só troca os parâmetros de backoff', () => {
    expect(efeitos('reconexao.intervaloInicialMs')).toEqual(
      new Set(['parametros_de_reconexao']),
    );
  });

  it('acumula efeitos de campos diferentes sem duplicar', () => {
    expect(efeitos('cor.limiarDeltaE', 'coresPorTag', 'log.nivel')).toEqual(
      new Set(['parametros_do_nucleo', 'reconfigurar_log']),
    );
  });
});

describe('FR-021a: só leitura.regiao zera a máquina de estado da cor', () => {
  it('leitura.regiao produz DOIS efeitos, e um deles é zerar_estado_de_cor', () => {
    // Troca a PROCEDÊNCIA da cor: a referência guardada foi extraída de outra
    // região da tela, e o ΔE seguinte compararia grandezas diferentes.
    const e = new Set(efeitosDe(['leitura.regiao']));

    expect(e).toEqual(new Set(['parametros_do_nucleo', 'zerar_estado_de_cor']));
  });

  it.each([
    'cor.limiarDeltaE',
    'cor.ciclosDeConfirmacao',
    'coresPorTag',
    'leitura.intervaloMs',
    'holyrics.host',
    'freestyler.grupo',
    'freestyler.corDeRepouso.r',
    'log.nivel',
    'painel.port',
    'reconexao.intervaloInicialMs',
  ])('%s NÃO zera a máquina de estado da cor', (caminho) => {
    // O teste negativo vale mais que o positivo: quem implementar "campo de cor
    // zera o estado" passa no de cima e falha aqui. Limiar e ciclos só mudam a
    // régua; coresPorTag já entra na máquina como cor efetiva por desenho da
    // 003.
    expect(efeitosDe([caminho])).not.toContain('zerar_estado_de_cor');
  });

  it('mesmo junto de outros campos, só a região zera', () => {
    const e = new Set(efeitosDe(['cor.limiarDeltaE', 'coresPorTag', 'log.nivel']));

    expect(e.has('zerar_estado_de_cor')).toBe(false);
  });
});

describe('FR-019: campo inalterado não produz efeito nenhum (004/T018)', () => {
  it('lista vazia devolve conjunto vazio', () => {
    expect(efeitosDe([])).toEqual([]);
  });
});

describe('caminho fora da tabela vira alarme, não silêncio (004/T019)', () => {
  it('produz o efeito desconhecido', () => {
    // Um campo acrescentado numa feature futura seria aceito pela página,
    // gravado no arquivo e simplesmente não valeria. Um padrão silencioso
    // tornaria isso indetectável.
    expect(efeitosDe(['algoQueAindaNaoExiste'])).toEqual(['desconhecido']);
  });

  it('produz desconhecido para campo aninhado fora da tabela', () => {
    expect(efeitosDe(['cor.algoNovo'])).toEqual(['desconhecido']);
  });

  it('não engole os efeitos dos campos conhecidos que vieram junto', () => {
    const e = new Set(efeitosDe(['log.nivel', 'algoQueAindaNaoExiste']));

    expect(e).toEqual(new Set(['reconfigurar_log', 'desconhecido']));
  });
});
