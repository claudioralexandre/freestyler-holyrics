/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ ✅ CONTRATO VERIFICADO — FreeStyler 4.1.7, 2026-07-29                      │
 * │                                                                           │
 * │ Formato de fio observado contra a ferramenta real, com hardware:          │
 * │   FSOC + código(3) + argumento(3)   comandar                              │
 * │   FSBC + código(3) + "000"          consultar, e ele responde             │
 * │                                                                           │
 * │ Fonte da tabela de códigos: Documentation/Sendmessage and TCPIP.pdf, que  │
 * │ acompanha a instalação do FreeStyler.                                     │
 * │                                                                           │
 * │ Contrato: specs/002-saida-dmx-freestyler/contracts/freestyler.md          │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Módulo puro: só monta e interpreta strings. Não abre socket, não decide nada.
 */

import type { Cor, Resultado } from '../../core/state.ts';

/** Códigos da tabela do fabricante que esta feature usa. */
export const CODIGO = {
  // Consultas (FSBC)
  nomesDeGrupos: 8,
  statusDeGrupos: 9,
  versao: 10,
  nomesDeFixtures: 17,
  enderecosDeFixtures: 18,
  fixturesSelecionadas: 23,

  // Slots de mistura de cor (FSOC).
  // A tabela os chama de Cyan/Magenta/Yellow; a lista de "release override" os
  // chama de red/green/blue. São os mesmos slots, nomeados conforme a fixture
  // ser subtrativa ou aditiva. VERIFICADO contra par LED RGB.
  vermelho: 130,
  verde: 131,
  azul: 132,
} as const;

/** O byte que o FreeStyler emite a cada ~1499 ms, sozinho, como sinal de vida. */
const BYTE_HEARTBEAT = 0xff;

const PREFIXO_RESPOSTA = 'FSBC';

function tresCasas(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Alterna o grupo na posição dada (1–24).
 *
 * **É toggle, não seleção.** Enviado com o grupo já ativo, ele DESLIGA. Quem
 * chama precisa ter checado o status antes — ver `precisaSelecionar` no núcleo.
 *
 * Os códigos não são contíguos: grupos 1–10 são 34–43, e 11–24 saltam para
 * 550–563.
 */
export function comandoDeGrupo(posicao: number): string {
  if (!Number.isInteger(posicao) || posicao < 1 || posicao > 24) {
    throw new RangeError(`posição de grupo fora de 1–24: ${posicao}`);
  }
  const codigo = posicao <= 10 ? 33 + posicao : 539 + posicao;
  return `FSOC${tresCasas(codigo)}255`;
}

/** Escreve os três slots de cor do grupo atualmente selecionado. */
export function comandoDeCor(cor: Cor): string {
  return (
    `FSOC${tresCasas(CODIGO.vermelho)}${tresCasas(cor.r)}` +
    `FSOC${tresCasas(CODIGO.verde)}${tresCasas(cor.g)}` +
    `FSOC${tresCasas(CODIGO.azul)}${tresCasas(cor.b)}`
  );
}

/** Monta uma consulta. O FreeStyler responde com o envelope decodificado abaixo. */
export function consulta(codigo: number): string {
  return `FSBC${tresCasas(codigo)}000`;
}

/** Distingue o pulso de vida de uma resposta de consulta. */
export function ehHeartbeat(dados: Buffer): boolean {
  return dados.length === 1 && dados[0] === BYTE_HEARTBEAT;
}

export interface RespostaDecodificada {
  /**
   * O que o byte de contagem dizia.
   *
   * **Guardado só como observação — não use para nada.** Ver `campos`.
   */
  readonly byteDeContagem: number;
  /** Os valores, na ordem em que vieram. Indexe por posição. */
  readonly campos: readonly string[];
}

/**
 * Decodifica `FSBC + byte + "," + valores`.
 *
 * **O byte de contagem é ignorado de propósito.** Medido em 4.1.7: nas
 * respostas de grupo ele vem um a menos que os campos (23 para 24 nomes, 24
 * para 25 status), e nas de fixture bate. Fatiar ou validar por ele produziria
 * erro de um exatamente onde importa — a posição do grupo a selecionar.
 *
 * A indexação posicional está verificada: com "03: Par Led" ativo, o índice 2 é
 * o que vale `1`.
 */
export function decodificarResposta(dados: Buffer): Resultado<RespostaDecodificada> {
  if (ehHeartbeat(dados)) {
    return { ok: false, motivo: 'resposta_invalida', detalhe: 'é heartbeat, não resposta' };
  }

  // 4 do prefixo + 1 do byte de contagem + ao menos o separador.
  if (dados.length < 6) {
    return { ok: false, motivo: 'resposta_invalida', detalhe: 'resposta curta demais' };
  }

  if (dados.subarray(0, 4).toString('latin1') !== PREFIXO_RESPOSTA) {
    return { ok: false, motivo: 'resposta_invalida', detalhe: 'prefixo não é FSBC' };
  }

  const byteDeContagem = dados[4] as number;
  const corpo = dados.subarray(5).toString('latin1');

  // Valor único (versão, master intensity) vem sem separador.
  if (!corpo.startsWith(',')) {
    return corpo.includes(',')
      ? { ok: false, motivo: 'resposta_invalida', detalhe: 'lista sem separador inicial' }
      : { ok: true, valor: { byteDeContagem, campos: [corpo] } };
  }

  return { ok: true, valor: { byteDeContagem, campos: corpo.slice(1).split(',') } };
}
