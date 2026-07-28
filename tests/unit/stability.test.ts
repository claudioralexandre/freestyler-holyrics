import { describe, expect, it } from 'vitest';
import { avaliarCor, type EstadoDeCor } from '../../src/core/stability.ts';
import { deltaE } from '../../src/core/color.ts';
import type { Cor, ParâmetrosDoNúcleo } from '../../src/core/state.ts';

const PARÂMETROS: ParâmetrosDoNúcleo = {
  regiao: 0,
  limiarDeltaE: 10,
  ciclosDeConfirmacao: 2,
};

const AZUL: Cor = { r: 0, g: 0, b: 255 };
/** Diferença bem abaixo do limiar — é o ruído de um vídeo de fundo parado. */
const AZUL_QUASE: Cor = { r: 2, g: 1, b: 252 };
const VERMELHO: Cor = { r: 255, g: 0, b: 0 };
const VERDE: Cor = { r: 0, g: 200, b: 0 };

/** Estado estável, com referência estabelecida e nenhuma avaliação em curso. */
function estável(cor: Cor): EstadoDeCor {
  return { corDeReferência: cor, candidata: null, ciclosDeConfirmação: 0 };
}

/** Alimenta uma sequência de leituras e devolve os anúncios produzidos. */
function alimentar(
  inicial: EstadoDeCor,
  leituras: readonly Cor[],
  parâmetros = PARÂMETROS,
) {
  let estado = inicial;
  const anúncios = [];
  for (const cor of leituras) {
    const d = avaliarCor(estado, cor, parâmetros);
    estado = d;
    if (d.anúncio !== null) anúncios.push(d.anúncio);
  }
  return { estado, anúncios };
}

describe('sanidade do limiar escolhido', () => {
  it('o ruído de fundo fica abaixo do limiar e a troca de tema, acima', () => {
    // Se esta premissa cair, os testes abaixo passam a medir outra coisa.
    expect(deltaE(AZUL, AZUL_QUASE)).toBeLessThan(PARÂMETROS.limiarDeltaE);
    expect(deltaE(AZUL, VERMELHO)).toBeGreaterThan(PARÂMETROS.limiarDeltaE);
  });
});

describe('limiar de mudança (FR-007)', () => {
  it('não anuncia leituras abaixo do limiar', () => {
    const { anúncios } = alimentar(estável(AZUL), [
      AZUL_QUASE,
      AZUL_QUASE,
      AZUL_QUASE,
      AZUL_QUASE,
    ]);

    expect(anúncios).toHaveLength(0);
  });

  it('preserva a cor de referência enquanto nada ultrapassa o limiar', () => {
    const { estado } = alimentar(estável(AZUL), [AZUL_QUASE, AZUL_QUASE]);

    expect(estado.corDeReferência).toEqual(AZUL);
  });
});

describe('confirmação por permanência (FR-007a)', () => {
  it('anuncia exatamente uma vez após N leituras consecutivas acima do limiar', () => {
    const { anúncios } = alimentar(estável(AZUL), [VERMELHO, VERMELHO]);

    expect(anúncios).toHaveLength(1);
    expect(anúncios[0]?.motivo).toBe('mudanca_confirmada');
  });

  it('não anuncia na primeira leitura acima do limiar, com N = 2', () => {
    const d = avaliarCor(estável(AZUL), VERMELHO, PARÂMETROS);

    expect(d.anúncio).toBeNull();
    expect(d.corDeReferência).toEqual(AZUL);
  });

  it('respeita N maior: com N = 3, só anuncia na terceira', () => {
    const exigente = { ...PARÂMETROS, ciclosDeConfirmacao: 3 };

    const doisCiclos = alimentar(estável(AZUL), [VERMELHO, VERMELHO], exigente);
    expect(doisCiclos.anúncios).toHaveLength(0);

    const trêsCiclos = alimentar(
      estável(AZUL),
      [VERMELHO, VERMELHO, VERMELHO],
      exigente,
    );
    expect(trêsCiclos.anúncios).toHaveLength(1);
  });

  it('com N = 1 anuncia imediatamente ao ultrapassar o limiar', () => {
    const imediato = { ...PARÂMETROS, ciclosDeConfirmacao: 1 };

    const { anúncios } = alimentar(estável(AZUL), [VERMELHO], imediato);

    expect(anúncios).toHaveLength(1);
  });

  it('não anuncia de novo enquanto a cor permanecer na nova referência', () => {
    const { anúncios } = alimentar(estável(AZUL), [
      VERMELHO,
      VERMELHO,
      VERMELHO,
      VERMELHO,
      VERMELHO,
    ]);

    expect(anúncios).toHaveLength(1);
  });
});

describe('salto passageiro é descartado (FR-007b)', () => {
  it('uma leitura acima seguida de uma abaixo não anuncia nada', () => {
    const { anúncios, estado } = alimentar(estável(AZUL), [
      VERMELHO,
      AZUL_QUASE,
    ]);

    expect(anúncios).toHaveLength(0);
    expect(estado.corDeReferência).toEqual(AZUL);
  });

  it('zera a contagem, exigindo N novas leituras seguidas depois do flash', () => {
    // Flash, volta ao normal, e só então a troca real começa.
    const { anúncios } = alimentar(estável(AZUL), [
      VERMELHO,
      AZUL_QUASE,
      VERMELHO,
    ]);

    // Se a contagem não tivesse zerado, este terceiro ciclo já anunciaria.
    expect(anúncios).toHaveLength(0);
  });

  it('descarta o flash de um único ciclo mesmo com cores muito distantes', () => {
    const { anúncios } = alimentar(estável(AZUL), [
      { r: 255, g: 255, b: 255 },
      AZUL,
    ]);

    expect(anúncios).toHaveLength(0);
  });
});

describe('referência adotada é a última da sequência (FR-009)', () => {
  it('adota a leitura mais recente, não a que iniciou a contagem', () => {
    const primeira: Cor = { r: 255, g: 0, b: 0 };
    const última: Cor = { r: 200, g: 10, b: 10 };

    const { anúncios, estado } = alimentar(estável(AZUL), [primeira, última]);

    expect(anúncios).toHaveLength(1);
    expect(anúncios[0]?.cor).toEqual(última);
    expect(estado.corDeReferência).toEqual(última);
  });

  it('informa a cor anterior no anúncio', () => {
    const { anúncios } = alimentar(estável(AZUL), [VERMELHO, VERMELHO]);

    expect(anúncios[0]?.anterior).toEqual(AZUL);
  });

  it('informa o ΔE que motivou o anúncio', () => {
    const { anúncios } = alimentar(estável(AZUL), [VERMELHO, VERMELHO]);

    expect(anúncios[0]?.deltaE).toBeGreaterThan(PARÂMETROS.limiarDeltaE);
  });
});

describe('candidatas não precisam ser idênticas entre si (FR-007c)', () => {
  it('confirma com leituras diferentes, desde que ambas acima do limiar', () => {
    // Vermelho e verde não têm nada a ver um com o outro, mas ambos estão longe
    // do azul de referência — e é contra a referência que se compara.
    const { anúncios } = alimentar(estável(AZUL), [VERMELHO, VERDE]);

    expect(anúncios).toHaveLength(1);
    expect(anúncios[0]?.cor).toEqual(VERDE);
  });
});

describe('afastamento gradual (US2, cenário 4)', () => {
  it('anuncia quando o acumulado ultrapassa o limiar, com passos pequenos', () => {
    const passos: Cor[] = [
      { r: 0, g: 0, b: 245 },
      { r: 0, g: 20, b: 235 },
      { r: 0, g: 40, b: 225 },
      { r: 0, g: 60, b: 215 },
      { r: 0, g: 90, b: 200 },
      { r: 0, g: 120, b: 190 },
      { r: 0, g: 150, b: 180 },
    ];

    // Cada passo é pequeno em relação ao anterior, mas a comparação é sempre
    // contra a referência — então o afastamento acumulado eventualmente conta.
    const { anúncios } = alimentar(estável(AZUL), passos);

    expect(anúncios.length).toBeGreaterThanOrEqual(1);
  });
});

describe('oscilação entre duas cores distantes (edge case)', () => {
  it('não anuncia enquanto nenhuma das duas se sustentar por N ciclos', () => {
    const { anúncios, estado } = alimentar(estável(AZUL), [
      VERMELHO,
      AZUL,
      VERMELHO,
      AZUL,
      VERMELHO,
      AZUL,
    ]);

    expect(anúncios).toHaveLength(0);
    expect(estado.corDeReferência).toEqual(AZUL);
  });
});

describe('determinismo (FR-008a)', () => {
  it('a mesma dupla de cores produz sempre a mesma decisão', () => {
    const a = avaliarCor(estável(AZUL), VERMELHO, PARÂMETROS);
    const b = avaliarCor(estável(AZUL), VERMELHO, PARÂMETROS);

    expect(a).toEqual(b);
  });

  it('o ΔE é simétrico', () => {
    expect(deltaE(AZUL, VERMELHO)).toBeCloseTo(deltaE(VERMELHO, AZUL), 10);
  });

  it('o ΔE de uma cor com ela mesma é zero', () => {
    expect(deltaE(AZUL, AZUL)).toBe(0);
  });
});
