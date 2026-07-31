import { describe, expect, it } from 'vitest';
import { validarConfig } from '../../src/adapters/config.ts';

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
