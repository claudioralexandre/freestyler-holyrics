import { describe, expect, it } from 'vitest';
import { validarConfig } from '../../src/adapters/config.ts';
import { CAFÉ, ehParDistinto } from '../fixtures/tags-unicode.ts';

/** Configuração mínima válida, base para as variações de cada teste. */
function base() {
  return {
    holyrics: { host: 'localhost', port: 8080, requestTimeoutMs: 800 },
    leitura: { intervaloMs: 1000, regiao: 0 },
    cor: { limiarDeltaE: 10, ciclosDeConfirmacao: 2 },
    reconexao: { intervaloInicialMs: 1000, intervaloMaximoMs: 15000 },
    log: {
      nivel: 'info',
      arquivo: './logs/integrador.log',
      tamanhoMaximoMb: 10,
      arquivosMantidos: 5,
    },
  };
}

describe('validação de configuração', () => {
  it('aceita a configuração de exemplo', () => {
    const r = validarConfig(base());
    expect(r.ok).toBe(true);
  });

  describe('validações entre campos', () => {
    it('recusa tempo limite maior que o intervalo de leitura (FR-004)', () => {
      const c = base();
      c.holyrics.requestTimeoutMs = 1500;
      c.leitura.intervaloMs = 1000;

      const r = validarConfig(c);

      expect(r.ok).toBe(false);
      if (r.ok) return;
      // Ciclos se atropelariam: a mensagem precisa nomear os dois campos.
      expect(r.erro).toMatch(/requestTimeoutMs/);
      expect(r.erro).toMatch(/intervaloMs/);
    });

    it('recusa tempo limite igual ao intervalo de leitura', () => {
      const c = base();
      c.holyrics.requestTimeoutMs = 1000;
      c.leitura.intervaloMs = 1000;

      expect(validarConfig(c).ok).toBe(false);
    });

    it('recusa teto de reconexão acima de 30s, que tornaria o SC-005 inalcançável (FR-015a)', () => {
      const c = base();
      c.reconexao.intervaloMaximoMs = 30001;

      const r = validarConfig(c);

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro).toMatch(/intervaloMaximoMs/);
    });

    it('aceita teto de reconexão exatamente em 30s', () => {
      const c = base();
      c.reconexao.intervaloMaximoMs = 30000;

      expect(validarConfig(c).ok).toBe(true);
    });

    it('recusa teto de reconexão menor que o intervalo inicial', () => {
      const c = base();
      c.reconexao.intervaloInicialMs = 5000;
      c.reconexao.intervaloMaximoMs = 2000;

      const r = validarConfig(c);

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro).toMatch(/intervaloInicialMs/);
    });
  });

  describe('validações de campo', () => {
    it('recusa região fora da faixa 0–7', () => {
      const c = base();
      c.leitura.regiao = 8;

      const r = validarConfig(c);

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro).toMatch(/regiao/);
    });

    it('aceita a região 7, extremo válido do array de 8 posições', () => {
      const c = base();
      c.leitura.regiao = 7;

      expect(validarConfig(c).ok).toBe(true);
    });

    it('recusa porta fora da faixa', () => {
      const c = base();
      c.holyrics.port = 70000;

      expect(validarConfig(c).ok).toBe(false);
    });

    it('recusa limiar de ΔE igual a zero, que anunciaria toda variação', () => {
      const c = base();
      c.cor.limiarDeltaE = 0;

      expect(validarConfig(c).ok).toBe(false);
    });

    it('recusa confirmação com menos de uma leitura', () => {
      const c = base();
      c.cor.ciclosDeConfirmacao = 0;

      expect(validarConfig(c).ok).toBe(false);
    });

    it('recusa intervalo de leitura abaixo de 250ms', () => {
      const c = base();
      c.leitura.intervaloMs = 100;
      c.holyrics.requestTimeoutMs = 50;

      expect(validarConfig(c).ok).toBe(false);
    });

    it('recusa nível de log desconhecido', () => {
      const c = base();
      c.log.nivel = 'verboso';

      expect(validarConfig(c).ok).toBe(false);
    });

    it('aponta o caminho do campo problemático na mensagem (FR-020)', () => {
      const c = base();
      c.log.tamanhoMaximoMb = -1;

      const r = validarConfig(c);

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro).toMatch(/log\.tamanhoMaximoMb/);
    });
  });

  describe('sobreposição por LOG_LEVEL', () => {
    it('aplica o nível vindo do ambiente sobre o do arquivo', () => {
      const r = validarConfig(base(), { LOG_LEVEL: 'debug' });

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.valor.log.nivel).toBe('debug');
    });

    it('recusa LOG_LEVEL inválido listando os níveis aceitos', () => {
      const r = validarConfig(base(), { LOG_LEVEL: 'gritando' });

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro).toMatch(/LOG_LEVEL/);
      expect(r.erro).toMatch(/debug/);
    });

    it('mantém o nível do arquivo quando LOG_LEVEL não está presente', () => {
      const r = validarConfig(base(), {});

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.valor.log.nivel).toBe('info');
    });
  });

  describe('mensagens não vazam segredo (SC-007)', () => {
    it('não ecoa valor algum que pareça credencial', () => {
      const c = base() as Record<string, unknown>;
      c.holyrics = { host: 'localhost', port: -1, token: 'segredo-vazado' };

      const r = validarConfig(c);

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro).not.toMatch(/segredo-vazado/);
    });
  });
});

describe('bloco freestyler (T018)', () => {
  const comFreestyler = (parcial: Record<string, unknown> = {}) => ({
    ...base(),
    freestyler: {
      host: 'localhost',
      port: 3332,
      grupo: '03: Par Led',
      corDeRepouso: { r: 0, g: 0, b: 0 },
      heartbeatTimeoutMs: 6000,
      ...parcial,
    },
  });

  it('aceita o bloco completo', () => {
    expect(validarConfig(comFreestyler()).ok).toBe(true);
  });

  it('aceita a AUSÊNCIA do bloco — é o estado do projeto antes desta feature', () => {
    expect(validarConfig(base()).ok).toBe(true);
  });

  it('usa padrão para host e porta, que seguem configuráveis (FR-023)', () => {
    const c = comFreestyler();
    delete (c.freestyler as Record<string, unknown>).host;
    delete (c.freestyler as Record<string, unknown>).port;

    const r = validarConfig(c);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.freestyler?.host).toBe('localhost');
    expect(r.valor.freestyler?.port).toBe(3332);
  });

  it('exige corDeRepouso quando há grupo (FR-026a)', () => {
    const c = comFreestyler();
    delete (c.freestyler as Record<string, unknown>).corDeRepouso;

    const r = validarConfig(c);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/corDeRepouso/);
  });

  it('ACEITA preto como cor de repouso — é assim que se apaga (FR-026b)', () => {
    const r = validarConfig(comFreestyler({ corDeRepouso: { r: 0, g: 0, b: 0 } }));

    expect(r.ok).toBe(true);
  });

  it('recusa componente de cor fora de 0–255', () => {
    expect(validarConfig(comFreestyler({ corDeRepouso: { r: 300, g: 0, b: 0 } })).ok).toBe(false);
  });

  it('recusa heartbeatTimeoutMs abaixo de 4500 (FR-021b)', () => {
    // Dois batimentos de ~1499ms são 2998ms: margem de 2ms contra atraso de
    // escalonamento é margem nenhuma.
    const r = validarConfig(comFreestyler({ heartbeatTimeoutMs: 3000 }));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/heartbeatTimeoutMs/);
  });

  it('aceita 4500 e usa 6000 como padrão', () => {
    expect(validarConfig(comFreestyler({ heartbeatTimeoutMs: 4500 })).ok).toBe(true);

    const c = comFreestyler();
    delete (c.freestyler as Record<string, unknown>).heartbeatTimeoutMs;
    const r = validarConfig(c);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.freestyler?.heartbeatTimeoutMs).toBe(6000);
  });

  it('NÃO aceita cor de repouso por fixture (FR-026d)', () => {
    const r = validarConfig(
      comFreestyler({ corDeRepouso: [{ fixture: 'Pl 1', r: 0, g: 0, b: 0 }] }),
    );

    expect(r.ok).toBe(false);
  });

  it('não vaza valores recebidos na mensagem de erro', () => {
    const r = validarConfig(comFreestyler({ heartbeatTimeoutMs: 1234 }));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).not.toMatch(/1234/);
  });

  describe('o bloco é o interruptor da feature (T063, FR-008a)', () => {
    it('recusa o bloco presente SEM nome de grupo — é erro, não modo de operação', () => {
      const c = comFreestyler();
      delete (c.freestyler as Record<string, unknown>).grupo;

      const r = validarConfig(c);

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro).toMatch(/grupo/);
    });

    it('recusa nome de grupo vazio, que seria a mesma ambiguidade escrita de outro jeito', () => {
      expect(validarConfig(comFreestyler({ grupo: '' })).ok).toBe(false);
    });

    it('a ausência do bloco é a ÚNICA forma de desligar a saída', () => {
      // Duas formas de dizer "desligado" tornariam indistinguíveis o operador que
      // desligou de propósito e o que esqueceu de preencher o nome.
      const r = validarConfig(base());

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.valor.freestyler).toBeUndefined();
    });
  });

  describe('prazo de consulta (T064, FR-023a)', () => {
    it('usa 2000 como padrão declarado', () => {
      const c = comFreestyler();
      delete (c.freestyler as Record<string, unknown>).consultaTimeoutMs;

      const r = validarConfig(c);

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.valor.freestyler?.consultaTimeoutMs).toBe(2000);
    });

    it('recusa prazo acima da metade da janela de heartbeat', () => {
      // A consulta precisa desistir ANTES de a mesa ser declarada morta; ao
      // contrário, a ordem dos diagnósticos no log fica enganosa.
      const r = validarConfig(
        comFreestyler({ heartbeatTimeoutMs: 6000, consultaTimeoutMs: 3001 }),
      );

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro).toMatch(/consultaTimeoutMs/);
      expect(r.erro).toMatch(/heartbeatTimeoutMs/);
    });

    it('aceita exatamente a metade da janela', () => {
      const r = validarConfig(
        comFreestyler({ heartbeatTimeoutMs: 6000, consultaTimeoutMs: 3000 }),
      );

      expect(r.ok).toBe(true);
    });

    it('recusa prazo não positivo', () => {
      expect(validarConfig(comFreestyler({ consultaTimeoutMs: 0 })).ok).toBe(false);
    });
  });
});

describe('seção coresPorTag (T011, feature 003)', () => {
  const AZUL = { r: 0, g: 40, b: 200 };
  const comTags = (coresPorTag: unknown) => ({ ...base(), coresPorTag });

  it('aceita o array de mapeamentos', () => {
    const r = validarConfig(
      comTags([
        { tag: 'azul-escuro', cor: { r: 0, g: 20, b: 120 } },
        { tag: 'azul', cor: AZUL },
      ]),
    );

    expect(r.ok).toBe(true);
  });

  it('preserva a ORDEM declarada — é ela que decide o empate (FR-007a)', () => {
    const r = validarConfig(
      comTags([
        { tag: 'azul', cor: AZUL },
        { tag: '2024', cor: AZUL },
        { tag: 'natal', cor: AZUL },
      ]),
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Com objeto no lugar de array, "2024" saltaria para a primeira posição.
    expect(r.valor.coresPorTag?.map((m) => m.tag)).toEqual(['azul', '2024', 'natal']);
  });

  it('ACEITA a ausência da seção — é o estado de antes desta feature (FR-002)', () => {
    const r = validarConfig(base());

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.coresPorTag).toBeUndefined();
  });

  it('aceita a lista vazia, que também desliga a feature', () => {
    expect(validarConfig(comTags([])).ok).toBe(true);
  });

  it('ACEITA preto como cor mapeada (FR-003)', () => {
    expect(validarConfig(comTags([{ tag: 'apagar', cor: { r: 0, g: 0, b: 0 } }])).ok).toBe(true);
  });

  it('recusa componente de cor fora de 0–255', () => {
    const r = validarConfig(comTags([{ tag: 'azul', cor: { r: 300, g: 0, b: 0 } }]));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/coresPorTag/);
  });

  it('recusa tag vazia ou só espaços, apontando o índice', () => {
    expect(validarConfig(comTags([{ tag: '', cor: AZUL }])).ok).toBe(false);

    const r = validarConfig(comTags([{ tag: 'ok', cor: AZUL }, { tag: '   ', cor: AZUL }]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/1/);
  });

  it('recusa objeto no lugar de array — a forma errada não passa em silêncio', () => {
    expect(validarConfig(comTags({ azul: AZUL })).ok).toBe(false);
  });

  it('não vaza valores recebidos na mensagem de erro', () => {
    const r = validarConfig(comTags([{ tag: 'azul', cor: { r: 999, g: 0, b: 0 } }]));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).not.toMatch(/999/);
  });
});

describe('invariante de carga do coresPorTag (T013, FR-004)', () => {
  const AZUL = { r: 0, g: 40, b: 200 };
  const VERMELHO = { r: 200, g: 0, b: 0 };
  const comTags = (coresPorTag: unknown) => ({ ...base(), coresPorTag });

  it('recusa duas tags que casam entre si, nomeando AS DUAS', () => {
    const r = validarConfig(
      comTags([
        { tag: 'Azul', cor: AZUL },
        { tag: ' azul ', cor: VERMELHO },
      ]),
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Escolher uma em silêncio daria cor estável e inexplicável.
    expect(r.erro).toMatch(/Azul/);
    expect(r.erro).toMatch(/azul/);
  });

  it('recusa o par de grafias Unicode E DIZ que o conflito é de codificação', () => {
    expect(ehParDistinto(CAFÉ)).toBe(true);

    const r = validarConfig(
      comTags([
        { tag: CAFÉ.composta, cor: AZUL },
        { tag: CAFÉ.decomposta, cor: VERMELHO },
      ]),
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    // As duas linhas aparecem IDÊNTICAS na tela do operador. Sem esta menção,
    // ele leria a acusação como erro do validador.
    expect(r.erro).toMatch(/codificação|Unicode/i);
  });

  it('aceita tags que apenas se parecem, sem casar', () => {
    expect(
      validarConfig(
        comTags([
          { tag: 'azul', cor: AZUL },
          { tag: 'azul-escuro', cor: VERMELHO },
          { tag: 'ceu', cor: AZUL },
          { tag: 'céu', cor: VERMELHO },
        ]),
      ).ok,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feature 004 — bloco `painel`
// ---------------------------------------------------------------------------

describe('bloco painel (004/T024)', () => {
  it('AUSENTE liga a página em 127.0.0.1:3333 (FR-004, FR-003a)', () => {
    // ⚠️ Convenção INVERSA à do bloco `freestyler`, e de propósito. Lá, ausência
    // desliga. Aqui, ausência liga — porque a alternativa é circular: o operador
    // descobriria que a página existe abrindo o arquivo que ela existe para ele
    // não precisar abrir.
    const r = validarConfig(base());

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.painel).toEqual({
      habilitado: true,
      host: '127.0.0.1',
      port: 3333,
    });
  });

  it('o padrão NÃO é escutar na rede (FR-003a)', () => {
    const r = validarConfig(base());

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Ligada por padrão MAIS aberta por padrão exporia edição de configuração em
    // toda instalação, inclusive nas de quem nunca quis a página.
    expect(r.valor.painel.host).toBe('127.0.0.1');
    expect(r.valor.painel.host).not.toBe('0.0.0.0');
  });

  it('habilitado: false desliga, e é ato explícito (FR-004)', () => {
    const c = { ...base(), painel: { habilitado: false } };

    const r = validarConfig(c);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.painel.habilitado).toBe(false);
  });

  it('bloco parcial recebe os padrões nos campos omitidos', () => {
    const c = { ...base(), painel: { port: 9090 } };

    const r = validarConfig(c);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.painel).toEqual({
      habilitado: true,
      host: '127.0.0.1',
      port: 9090,
    });
  });

  it('aceita abrir para a rede quando declarado (FR-003)', () => {
    const c = { ...base(), painel: { host: '0.0.0.0' } };

    const r = validarConfig(c);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.painel.host).toBe('0.0.0.0');
  });

  it('recusa host vazio', () => {
    const r = validarConfig({ ...base(), painel: { host: '' } });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/painel\.host/);
  });

  it('recusa porta fora de faixa', () => {
    expect(validarConfig({ ...base(), painel: { port: 0 } }).ok).toBe(false);
    expect(validarConfig({ ...base(), painel: { port: 70000 } }).ok).toBe(false);
  });

  it('recusa porta não inteira', () => {
    expect(validarConfig({ ...base(), painel: { port: 3333.5 } }).ok).toBe(false);
  });
});

describe('o token não tem como vazar pela configuração (004/T039, FR-015, SC-008)', () => {
  it('a configuração validada não contém o token, qualquer que seja ele', () => {
    // Este teste não conserta nada hoje: `carregarConfig` devolve
    // `{ config, token, caminho }` como IRMÃOS, e o token nunca esteve dentro de
    // `Config`. A garantia é estrutural.
    //
    // Ele existe para que continue sendo. A página serializa `Config` inteira
    // numa resposta HTTP; se alguém "melhorar" a estrutura movendo o token para
    // dentro, a FR-015 e a SC-008 cairiam sem que nenhum outro teste reclamasse.
    const segredo = 'token-secretissimo-do-holyrics-123';

    const r = validarConfig(base(), {
      HOLYRICS_TOKEN: segredo,
      CONFIG_PATH: './config/config.json',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.valor)).not.toContain(segredo);
    expect(JSON.stringify(r.valor)).not.toMatch(/token/i);
  });
});
