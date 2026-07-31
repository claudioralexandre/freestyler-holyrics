import { describe, expect, it } from 'vitest';
import type { Logger } from 'pino';
import { criarSaídaDMX } from '../../src/service/saida-dmx.ts';
import type { ClienteFreestyler } from '../../src/adapters/freestyler/client.ts';
import type { Evento } from '../../src/core/events.ts';
import type { Cor, Resultado } from '../../src/core/state.ts';
import type { RespostaDecodificada } from '../../src/adapters/freestyler/protocolo.ts';
import { CODIGO } from '../../src/adapters/freestyler/protocolo.ts';

const AZUL: Cor = { r: 0, g: 0, b: 255 };
const VERMELHO: Cor = { r: 255, g: 0, b: 0 };
const REPOUSO: Cor = { r: 9, g: 9, b: 9 };

const corAnunciada = (cor: Cor): Evento => ({
  tipo: 'cor_anunciada',
  momento: 1,
  cor,
  anterior: null,
  motivo: 'mudanca_confirmada',
  deltaE: 40,
  // Idem: a saída DMX não pergunta de onde a cor veio (003, plan.md).
  origem: 'extraida',
  tag: null,
  extraída: cor,
});

/** Logger mudo com a superfície que o serviço usa. */
const logMudo = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

/** Logger que guarda o que foi registrado, para os testes de log obrigatório. */
interface LinhaDeLog {
  nível: 'info' | 'warn' | 'error' | 'debug';
  dados: Record<string, unknown>;
  mensagem: string;
}

function logCapturado(): { linhas: LinhaDeLog[]; log: Logger } {
  const linhas: LinhaDeLog[] = [];
  const registrar =
    (nível: LinhaDeLog['nível']) =>
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

interface ClienteFalso extends ClienteFreestyler {
  enviados: string[];
  falharAoEnviar: boolean;
  gruposAtivos: number[];
  /** `FSBC023000` — 15 valores 0/1, posicional com os nomes das fixtures. */
  fixturesSelecionadas: string[];
  /** Códigos consultados, na ordem, para contar consultas por seleção. */
  consultados: number[];
}

/** As 6 fixtures do grupo "03: Par Led", como a instalação real responde. */
const SEIS_SELECIONADAS = ['1', '1', '1', '1', '1', '1', '0', '0', '0', '0', '0', '0', '0', '0', '0'];
const NENHUMA_SELECIONADA = Array<string>(15).fill('0');
const NOMES_DE_FIXTURES = [
  'Pl 1',
  'Pl 2',
  'Pl 3',
  'Pl 4',
  'Pl 5 Bateria',
  'Pl 6 Pastores',
  'Parede Bat.',
  'Parede Pr.',
  'Frontal',
  'Col. Bateria',
  'Col. Prs',
  'Alto Pr.',
  'Chão Pr.',
  'Alto Bateria',
  'Chão Bateria',
];

function clienteFalso(gruposAtivos: number[] = []): ClienteFalso {
  const c: ClienteFalso = {
    enviados: [],
    falharAoEnviar: false,
    gruposAtivos,
    fixturesSelecionadas: SEIS_SELECIONADAS,
    consultados: [],

    conectado: () => true,
    conectar: async () => ({ ok: true, valor: undefined }),
    fechar: () => undefined,

    enviar(texto: string): Resultado<void> {
      if (c.falharAoEnviar) {
        return { ok: false, motivo: 'indisponivel', detalhe: 'falha simulada' };
      }
      c.enviados.push(texto);
      // O comando de grupo é toggle: o falso precisa imitar isso, senão o
      // teste não vale nada.
      const m = /^FSOC(\d{3})255$/.exec(texto);
      if (m) {
        const cod = Number(m[1]);
        const pos = cod >= 34 && cod <= 43 ? cod - 33 : cod >= 550 && cod <= 563 ? cod - 539 : null;
        if (pos !== null) {
          c.gruposAtivos = c.gruposAtivos.includes(pos)
            ? c.gruposAtivos.filter((g) => g !== pos)
            : [pos]; // seleção exclusiva
        }
      }
      return { ok: true, valor: undefined };
    },

    async consultar(codigo: number): Promise<Resultado<RespostaDecodificada>> {
      c.consultados.push(codigo);
      if (codigo === CODIGO.fixturesSelecionadas) {
        return {
          ok: true,
          valor: { byteDeContagem: 15, campos: c.fixturesSelecionadas },
        };
      }
      if (codigo === CODIGO.nomesDeFixtures) {
        return { ok: true, valor: { byteDeContagem: 15, campos: NOMES_DE_FIXTURES } };
      }
      if (codigo === CODIGO.nomesDeGrupos) {
        return { ok: true, valor: { byteDeContagem: 3, campos: ['a', 'b', '03: Par Led'] } };
      }
      if (codigo === CODIGO.statusDeGrupos) {
        return {
          ok: true,
          valor: {
            byteDeContagem: 24,
            campos: Array.from({ length: 24 }, (_, i) =>
              c.gruposAtivos.includes(i + 1) ? '1' : '0',
            ),
          },
        };
      }
      return { ok: true, valor: { byteDeContagem: 1, campos: [''] } };
    },
  };
  return c;
}

const criar = (cliente: ClienteFreestyler) =>
  criarSaídaDMX({
    cliente,
    parâmetros: { corDeRepouso: REPOUSO, nomeDoGrupo: '03: Par Led' },
    log: logMudo,
  });

const comandosDeCor = (enviados: string[]) => enviados.filter((e) => e.startsWith('FSOC130'));
const comandosDeGrupo = (enviados: string[]) =>
  enviados.filter((e) => /^FSOC(0\d\d|5\d\d)255$/.test(e) && !e.startsWith('FSOC13'));

describe('ciclo completo com cliente falso', () => {
  it('resolve o grupo, seleciona e escreve a cor', async () => {
    const c = clienteFalso();
    const s = criar(c);

    await s.aoEvento(corAnunciada(AZUL));

    expect(comandosDeGrupo(c.enviados)).toEqual(['FSOC036255']);
    expect(comandosDeCor(c.enviados)).toEqual(['FSOC130000FSOC131000FSOC132255']);
    expect(s.estado().últimoConjuntoEscrito).toEqual(AZUL);
  });

  it('NÃO reenvia o toggle quando o grupo já está ativo (T046, FR-012a)', async () => {
    const c = clienteFalso();
    const s = criar(c);

    await s.aoEvento(corAnunciada(AZUL));
    await s.aoEvento(corAnunciada(VERMELHO));

    // Um único comando de grupo nas duas aplicações. Se fossem dois, a segunda
    // teria DESLIGADO o grupo e a luz apagaria de dois em dois.
    expect(comandosDeGrupo(c.enviados)).toHaveLength(1);
    expect(comandosDeCor(c.enviados)).toHaveLength(2);
    expect(c.gruposAtivos).toEqual([3]);
  });

  it('seis mudanças seguidas mantêm o grupo aceso o tempo todo (cenário 7)', async () => {
    const c = clienteFalso();
    const s = criar(c);

    for (let i = 0; i < 6; i++) {
      await s.aoEvento(corAnunciada({ r: i * 10, g: 0, b: 0 }));
      expect(c.gruposAtivos).toEqual([3]);
    }

    expect(comandosDeGrupo(c.enviados)).toHaveLength(1);
    expect(comandosDeCor(c.enviados)).toHaveLength(6);
  });

  it('não comanda nada antes da primeira cor (FR-027)', async () => {
    const c = clienteFalso();
    const s = criar(c);

    await s.aoEvento({ tipo: 'apresentacao_encerrada', momento: 1 } as unknown as Evento);
    await s.aoEvento({ tipo: 'holyrics_recuperado', momento: 2 } as unknown as Evento);

    expect(c.enviados).toEqual([]);
  });

  it('leva ao repouso quando a apresentação encerra, depois da primeira cor', async () => {
    const c = clienteFalso();
    const s = criar(c);

    await s.aoEvento(corAnunciada(AZUL));
    await s.aoEvento({ tipo: 'apresentacao_encerrada', momento: 9 } as unknown as Evento);

    expect(s.estado().últimoConjuntoEscrito).toEqual(REPOUSO);
  });
});

describe('tudo-ou-nada (T044, FR-029)', () => {
  it('falha de envio NÃO avança o último conjunto escrito', async () => {
    const c = clienteFalso();
    const s = criar(c);
    await s.aoEvento(corAnunciada(AZUL));
    expect(s.estado().últimoConjuntoEscrito).toEqual(AZUL);

    c.falharAoEnviar = true;
    await s.aoEvento(corAnunciada(VERMELHO));

    expect(s.estado().últimoConjuntoEscrito).toEqual(AZUL);
    expect(s.estado().corPretendida).toEqual(VERMELHO);
  });

  it('a divergência dispara reenvio sem precisar de evento novo (FR-029a)', async () => {
    const c = clienteFalso();
    const s = criar(c);
    await s.aoEvento(corAnunciada(AZUL));

    c.falharAoEnviar = true;
    await s.aoEvento(corAnunciada(VERMELHO));
    expect(s.estado().últimoConjuntoEscrito).toEqual(AZUL);

    // O Freestyler volta a aceitar; o reprocessamento periódico conserta.
    c.falharAoEnviar = false;
    await s.reprocessar();

    expect(s.estado().últimoConjuntoEscrito).toEqual(VERMELHO);
  });
});

describe('reconexão (T028, FR-011, FR-020)', () => {
  it('esquece grupo e escrita, e reaplica a cor pretendida', async () => {
    const c = clienteFalso();
    const s = criar(c);
    await s.aoEvento(corAnunciada(AZUL));
    const antes = comandosDeCor(c.enviados).length;

    // A mesa reiniciou: sem grupo selecionado e sem saber o que está valendo.
    c.gruposAtivos = [];
    await s.aoReconectar();

    expect(comandosDeCor(c.enviados).length).toBe(antes + 1);
    expect(c.gruposAtivos).toEqual([3]);
    expect(s.estado().últimoConjuntoEscrito).toEqual(AZUL);
  });

  it('não reaplica nada se ainda não houve cor', async () => {
    const c = clienteFalso();
    const s = criar(c);

    await s.aoReconectar();

    expect(c.enviados).toEqual([]);
  });
});

describe('fixturas atingidas pela seleção (T066, FR-025b, SC-012)', () => {
  it('registra quantas e quais fixtures a seleção atingiu', async () => {
    const c = clienteFalso();
    const { linhas, log } = logCapturado();
    const s = criarSaídaDMX({
      cliente: c,
      parâmetros: { corDeRepouso: REPOUSO, nomeDoGrupo: '03: Par Led' },
      log,
    });
    await s.registrarInventário();

    await s.aoEvento(corAnunciada(AZUL));

    const linha = linhas.find((l) => l.dados.fixturesAtingidas !== undefined);
    expect(linha).toBeDefined();
    expect(linha?.nível).toBe('info');
    expect(linha?.dados.fixturesAtingidas).toBe(6);
    expect(linha?.dados.fixtures).toEqual([
      'Pl 1',
      'Pl 2',
      'Pl 3',
      'Pl 4',
      'Pl 5 Bateria',
      'Pl 6 Pastores',
    ]);
  });

  it('grupo existente e VAZIO vira aviso explícito — o sintoma é igual ao de defeito', async () => {
    const c = clienteFalso();
    c.fixturesSelecionadas = NENHUMA_SELECIONADA;
    const { linhas, log } = logCapturado();
    const s = criarSaídaDMX({
      cliente: c,
      parâmetros: { corDeRepouso: REPOUSO, nomeDoGrupo: '03: Par Led' },
      log,
    });

    await s.aoEvento(corAnunciada(AZUL));

    const aviso = linhas.find((l) => l.dados.fixturesAtingidas === 0);
    expect(aviso).toBeDefined();
    expect(aviso?.nível).toBe('warn');
    expect(aviso?.mensagem).toMatch(/vazio/);
  });

  it('a cor é escrita mesmo com o grupo vazio — o aviso não é recusa', async () => {
    const c = clienteFalso();
    c.fixturesSelecionadas = NENHUMA_SELECIONADA;
    const s = criar(c);

    await s.aoEvento(corAnunciada(AZUL));

    expect(s.estado().últimoConjuntoEscrito).toEqual(AZUL);
  });

  it('consulta por seleção EFETIVADA, não por aplicação de cor', async () => {
    const c = clienteFalso();
    const s = criar(c);

    await s.aoEvento(corAnunciada(AZUL));
    await s.aoEvento(corAnunciada(VERMELHO));
    await s.aoEvento(corAnunciada({ r: 1, g: 2, b: 3 }));

    // Três cores, uma seleção só: o custo não entra no caminho quente (FR-014).
    const consultas = c.consultados.filter((cod) => cod === CODIGO.fixturesSelecionadas);
    expect(consultas).toHaveLength(1);
  });

  it('sem inventário lido, registra as posições em vez dos nomes', async () => {
    const c = clienteFalso();
    const { linhas, log } = logCapturado();
    const s = criarSaídaDMX({
      cliente: c,
      parâmetros: { corDeRepouso: REPOUSO, nomeDoGrupo: '03: Par Led' },
      log,
    });

    await s.aoEvento(corAnunciada(AZUL));

    const linha = linhas.find((l) => l.dados.fixturesAtingidas !== undefined);
    expect(linha?.dados.fixturesAtingidas).toBe(6);
    expect(linha?.dados.fixtures).toEqual(['#1', '#2', '#3', '#4', '#5', '#6']);
  });
});

describe('grupo inexistente (FR-010, FR-010a)', () => {
  it('não comanda nada e não lança', async () => {
    const c = clienteFalso();
    const s = criarSaídaDMX({
      cliente: c,
      parâmetros: { corDeRepouso: REPOUSO, nomeDoGrupo: 'Grupo que não existe' },
      log: logMudo,
    });

    await s.aoEvento(corAnunciada(AZUL));

    expect(c.enviados).toEqual([]);
    expect(s.estado().últimoConjuntoEscrito).toBeNull();
    // A intenção permanece: quando o grupo aparecer, a cor vai junto.
    expect(s.estado().corPretendida).toEqual(AZUL);
  });
});
