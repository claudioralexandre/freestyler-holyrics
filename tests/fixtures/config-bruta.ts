/**
 * Configuração **bruta** — como ela está no disco, antes de qualquer validação.
 *
 * O ponto desta fixture é o que o esquema **não** conhece. `zod` descarta chave
 * desconhecida em `safeParse`, então gravar o objeto validado apagaria em
 * silêncio tudo que estivesse no arquivo e não estivesse no esquema. É contra
 * isso que a mesclagem existe (004/FR-025), e é isso que estas chaves exercitam.
 *
 * Devolvida por função, e não exportada como constante, porque a mesclagem
 * recebe objetos aninhados: um teste que mutasse o resultado contaminaria o
 * seguinte.
 */

/** Chaves que o esquema ignora, e que a gravação precisa preservar. */
export const CHAVE_DESCONHECIDA_DE_TOPO = '_leia-me';
export const CHAVE_DESCONHECIDA_ANINHADA = '_anotacao';

export function configBruta(): Record<string, unknown> {
  return {
    [CHAVE_DESCONHECIDA_DE_TOPO]: [
      'Comentário estruturado como os de config.example.json.',
      'Some se a gravação serializar o objeto validado em vez de mesclar.',
    ],
    holyrics: {
      host: 'localhost',
      port: 8080,
      requestTimeoutMs: 800,
      // Aninhada de propósito: preservar só o topo é o meio-caminho que passaria
      // num teste ingênuo e perderia dado num arquivo real.
      [CHAVE_DESCONHECIDA_ANINHADA]: 'medido em 2026-07-28: 1,5 ms na LAN',
    },
    leitura: {
      intervaloMs: 1000,
      regiao: 0,
    },
    cor: {
      limiarDeltaE: 2,
      ciclosDeConfirmacao: 2,
    },
    // Três entradas, em ordem declarada. A ordem É a regra de precedência
    // (003/FR-007) — se a mesclagem a alterar, o override passa a escolher outro
    // vencedor sem que nada falhe.
    coresPorTag: [
      { tag: 'azul-escuro', cor: { r: 0, g: 20, b: 120 } },
      { tag: 'azul', cor: { r: 0, g: 40, b: 200 } },
      { tag: 'verde', cor: { r: 0, g: 160, b: 60 } },
    ],
    reconexao: {
      intervaloInicialMs: 1000,
      intervaloMaximoMs: 15000,
    },
    freestyler: {
      host: 'localhost',
      port: 3332,
      grupo: '03: Par Led',
      corDeRepouso: { r: 0, g: 0, b: 0 },
      heartbeatTimeoutMs: 6000,
      consultaTimeoutMs: 2000,
    },
    log: {
      nivel: 'info',
      arquivo: './logs/integrador.log',
      tamanhoMaximoMb: 10,
      arquivosMantidos: 5,
    },
  };
}
