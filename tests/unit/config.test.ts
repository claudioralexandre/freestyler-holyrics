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
