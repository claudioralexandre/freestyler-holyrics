/**
 * Respostas do FreeStyler.
 *
 * ✅ ORIGEM: capturadas do FreeStyler **4.1.7** em 2026-07-29, com a instalação
 * real — 15 fixtures, 5 grupos nomeados, pares LED RGB nos endereços 1, 4, 7 e
 * 10. Não são exemplos inventados.
 *
 * Contrato: specs/002-saida-dmx-freestyler/contracts/freestyler.md
 */

/** Monta o envelope de resposta como ele chega no fio. */
function envelope(byteDeContagem: number, corpo: string): Buffer {
  return Buffer.concat([
    Buffer.from('FSBC', 'latin1'),
    Buffer.from([byteDeContagem]),
    Buffer.from(corpo, 'latin1'),
  ]);
}

/** `FSBC010000` — versão. Byte de contagem 1, um único valor. */
export const respostaVersao = envelope(1, '4.1.7');

/**
 * `FSBC008000` — nomes dos grupos.
 *
 * Byte de contagem **23**, mas são **24** campos. Ver o aviso no contrato: o
 * byte não é confiável nas respostas de grupo.
 */
export const respostaGrupos = envelope(
  23,
  ',01: Mov Chão,02: Mov. Teto,03: Par Led,04: Parede,05: mov,,,,,,,,,,,,,,,,,,,',
);

/** `FSBC009000` — status dos grupos, nenhum ativo. Byte 24, 25 campos. */
export const respostaStatusNenhumAtivo = envelope(
  24,
  ',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
);

/**
 * `FSBC009000` com "03: Par Led" ativo.
 *
 * O `1` está na terceira posição depois do campo vazio inicial — indexação
 * posicional verificada contra a ferramenta.
 */
export const respostaStatusGrupo3Ativo = envelope(
  24,
  ',0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
);

/** `FSBC009000` com o grupo 4 ativo — usado para provar que a seleção é exclusiva. */
export const respostaStatusGrupo4Ativo = envelope(
  24,
  ',0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
);

/** `FSBC017000` — nomes das fixtures. Byte 15, 15 campos: aqui bate. */
export const respostaFixtures = envelope(
  15,
  ',Pl 1,Pl 2,Pl 3,Pl 4,Pl 5 Bateria,Pl 6 Pastores,Parede Bat.,Parede Pr.,Frontal,Col. Bateria,Col. Prs,Alto Pr.,Chão Pr.,Alto Bateria,Chão Bateria',
);

/** `FSBC018000` — endereços, posicional com os nomes acima. */
export const respostaEnderecos = envelope(15, ',1,4,7,10,13,21,29,33,92,41,49,52,62,72,82');

/** `FSBC023000` — fixtures selecionadas com o grupo 3 ativo: as seis primeiras. */
export const respostaFixturesSelecionadas = envelope(15, ',1,1,1,1,1,1,0,0,0,0,0,0,0,0,0');

/** O heartbeat. Chega sozinho a cada ~1499 ms, sem relação com o tráfego. */
export const heartbeat = Buffer.from([0xff]);

/** Resposta truncada no meio do cabeçalho — deve virar falha, nunca exceção. */
export const respostaTruncada = Buffer.from('FS', 'latin1');

/** Resposta sem o separador inicial — fora do formato observado. */
export const respostaSemSeparador = envelope(3, 'a,b,c');

/**
 * Os nomes dos grupos desta instalação, já separados.
 *
 * Atalho para os testes de `resolverGrupo`, que trabalham com o array e não com
 * o envelope.
 */
export const gruposDaInstalacao: readonly string[] = [
  '01: Mov Chão',
  '02: Mov. Teto',
  '03: Par Led',
  '04: Parede',
  '05: mov',
  ...Array<string>(19).fill(''),
];
