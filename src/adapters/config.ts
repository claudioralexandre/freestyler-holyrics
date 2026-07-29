/**
 * Configuração do integrador.
 *
 * Contrato: specs/001-leitura-cor-holyrics/contracts/config.md
 *
 * A validação (`validarConfig`) é pura e testada. A leitura de disco
 * (`carregarConfig`) é I/O e fica sem teste automatizado, por decisão registrada
 * na Structure Decision do plano.
 */

import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const NÍVEIS_DE_LOG = ['debug', 'info', 'warn', 'error'] as const;
export type NívelDeLog = (typeof NÍVEIS_DE_LOG)[number];

/** Teto do intervalo entre tentativas, imposto pelo prazo do SC-005. */
const TETO_RECONEXAO_MS = 30_000;

/**
 * Cor declarada na configuração, componentes 0–255.
 *
 * Preto é valor válido e significa apagar as fixtures (FR-026b) — é o caso que
 * uma validação ingênua de "cor obrigatória" rejeitaria por engano.
 */
const corConfigurada = z.object({
  r: z.int().min(0).max(255),
  g: z.int().min(0).max(255),
  b: z.int().min(0).max(255),
});

const esquema = z.object({
  holyrics: z.object({
    host: z.string().min(1),
    port: z.int().min(1).max(65535),
    requestTimeoutMs: z.int().positive(),
  }),
  leitura: z.object({
    intervaloMs: z.int().min(250),
    // Índice do array de 8 posições devolvido por GetColorMap (FR-002).
    regiao: z.int().min(0).max(7),
  }),
  cor: z.object({
    limiarDeltaE: z.number().positive(),
    ciclosDeConfirmacao: z.int().min(1),
  }),
  reconexao: z.object({
    intervaloInicialMs: z.int().positive(),
    intervaloMaximoMs: z.int().positive().max(TETO_RECONEXAO_MS),
  }),
  log: z.object({
    nivel: z.enum(NÍVEIS_DE_LOG),
    arquivo: z.string().min(1),
    tamanhoMaximoMb: z.number().positive(),
    arquivosMantidos: z.int().min(1),
  }),
  /**
   * Saída DMX (feature 002). **Opcional**: sem este bloco o integrador roda como
   * a 001 sozinha — lê o Holyrics, publica eventos e não comanda luz nenhuma.
   *
   * Note o que NÃO está aqui: endereço DMX, offsets de canal, lista de
   * fixtures, universo. O Freestyler já sabe o patch e responde quando
   * perguntado; duplicá-lo em arquivo criaria uma segunda fonte de verdade
   * para divergir da primeira (FR-009).
   */
  freestyler: z
    .object({
      host: z.string().min(1).default('localhost'),
      port: z.int().min(1).max(65535).default(3332),
      /** Nome do grupo tal como aparece no Freestyler, ex.: "03: Par Led". */
      grupo: z.string().min(1),
      corDeRepouso: corConfigurada,
      /**
       * O pulso do Freestyler é de ~1499 ms. Três batimentos são 4497 ms; abaixo
       * disso qualquer atraso de escalonamento vira falsa queda (FR-021b).
       */
      heartbeatTimeoutMs: z.int().min(4500).default(6000),
    })
    .optional(),
});

export type Config = z.infer<typeof esquema>;

export type ResultadoDeValidação =
  | { readonly ok: true; readonly valor: Config }
  | { readonly ok: false; readonly erro: string };

/** Ambiente relevante. Recebido por parâmetro para manter a função pura. */
export interface Ambiente {
  readonly HOLYRICS_TOKEN?: string | undefined;
  readonly CONFIG_PATH?: string | undefined;
  readonly LOG_LEVEL?: string | undefined;
}

const CAMINHO_PADRÃO = './config/config.json';

/**
 * Monta a mensagem de erro a partir das falhas do esquema.
 *
 * Usa apenas caminho do campo e descrição do problema — **nunca o valor
 * recebido**, para que uma credencial colocada por engano na configuração não
 * apareça em log (SC-007, FR-019).
 */
function formatarErros(erro: z.ZodError): string {
  return erro.issues
    .map((i) => {
      const caminho = i.path.join('.');
      return caminho ? `${caminho}: ${i.message}` : i.message;
    })
    .join('; ');
}

/**
 * Valida a configuração bruta e aplica as sobreposições de ambiente.
 *
 * Pura: mesma entrada, mesma saída. Não lê disco, não lê `process.env`.
 */
export function validarConfig(
  bruta: unknown,
  ambiente: Ambiente = {},
): ResultadoDeValidação {
  const analisada = esquema.safeParse(bruta);
  if (!analisada.success) {
    return { ok: false, erro: formatarErros(analisada.error) };
  }

  const config = analisada.data;

  // LOG_LEVEL sobrepõe o nível do arquivo — é o que permite subir em `debug`
  // para calibração sem editar a configuração.
  const nívelDoAmbiente = ambiente.LOG_LEVEL;
  if (nívelDoAmbiente !== undefined && nívelDoAmbiente !== '') {
    if (!(NÍVEIS_DE_LOG as readonly string[]).includes(nívelDoAmbiente)) {
      return {
        ok: false,
        erro: `LOG_LEVEL: nível desconhecido. Aceitos: ${NÍVEIS_DE_LOG.join(', ')}`,
      };
    }
    config.log.nivel = nívelDoAmbiente as NívelDeLog;
  }

  // --- Validações entre campos ---------------------------------------------
  // Não valem por campo isolado, então ficam fora do esquema.

  // Um tempo limite maior ou igual ao intervalo garantiria ciclos se
  // atropelando, contra a FR-004.
  if (config.holyrics.requestTimeoutMs >= config.leitura.intervaloMs) {
    return {
      ok: false,
      erro:
        `holyrics.requestTimeoutMs deve ser menor que leitura.intervaloMs — ` +
        `caso contrário os ciclos se sobrepõem`,
    };
  }

  // Um backoff que encolhesse a cada falha não seria backoff.
  if (config.reconexao.intervaloMaximoMs < config.reconexao.intervaloInicialMs) {
    return {
      ok: false,
      erro:
        `reconexao.intervaloMaximoMs deve ser maior ou igual a ` +
        `reconexao.intervaloInicialMs`,
    };
  }

  return { ok: true, valor: config };
}

export interface ConfigCarregada {
  readonly config: Config;
  /** Nunca registrado em log, nunca serializado (FR-019). */
  readonly token: string;
  readonly caminho: string;
}

export class ErroDeConfiguração extends Error {}

/**
 * Lê a configuração do disco e o token do ambiente.
 *
 * Lança `ErroDeConfiguração` com mensagem explícita — é a única condição que
 * legitimamente impede o serviço de subir (FR-020).
 */
export function carregarConfig(
  ambiente: Ambiente = process.env,
): ConfigCarregada {
  const token = ambiente.HOLYRICS_TOKEN;
  if (token === undefined || token.trim() === '') {
    throw new ErroDeConfiguração(
      'A variável de ambiente HOLYRICS_TOKEN não está definida. ' +
        'O token do Holyrics vem do ambiente, nunca do arquivo de configuração.',
    );
  }

  const caminho = ambiente.CONFIG_PATH ?? CAMINHO_PADRÃO;

  let conteúdo: string;
  try {
    conteúdo = readFileSync(caminho, 'utf8');
  } catch {
    throw new ErroDeConfiguração(
      `Arquivo de configuração não encontrado ou ilegível: ${caminho}. ` +
        'Copie config/config.example.json e ajuste, ou aponte CONFIG_PATH.',
    );
  }

  let bruta: unknown;
  try {
    bruta = JSON.parse(conteúdo);
  } catch (e) {
    throw new ErroDeConfiguração(
      `JSON malformado em ${caminho}: ${(e as Error).message}`,
    );
  }

  const validada = validarConfig(bruta, ambiente);
  if (!validada.ok) {
    throw new ErroDeConfiguração(
      `Configuração inválida em ${caminho} — ${validada.erro}`,
    );
  }

  return { config: validada.valor, token, caminho };
}
