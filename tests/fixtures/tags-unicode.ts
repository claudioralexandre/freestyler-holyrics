/**
 * Pares de grafia Unicode para os testes de casamento de tag (FR-006a).
 *
 * **Tudo aqui é construído em tempo de execução com `.normalize()`, e nada é
 * literal.** Um literal em NFD escrito à mão pode ser convertido em NFC pelo
 * editor, pelo formatador ou pelo git ao salvar — e aí o teste compararia a
 * string consigo mesma e passaria sem testar coisa alguma.
 *
 * Derivar as duas formas de uma origem só é o que torna o teste honesto: se a
 * ferramenta converter o arquivo, `nfd()` continua produzindo NFD.
 */

/** Forma composta: o acento e a letra num único code point. */
export function nfc(texto: string): string {
  return texto.normalize('NFC');
}

/** Forma decomposta: a letra seguida do acento combinante. */
export function nfd(texto: string): string {
  return texto.normalize('NFD');
}

/**
 * O par canônico dos testes.
 *
 * Medido: `composta.length` é 4 e `decomposta.length` é 5, `===` entre as duas é
 * falso, e `toLowerCase()` **não** as aproxima — só a normalização aproxima.
 */
export const CAFÉ = {
  composta: nfc('café'),
  decomposta: nfd('café'),
} as const;

/** Segundo par, com til, para não depender de um acento só. */
export const CORAÇÃO = {
  composta: nfc('coração'),
  decomposta: nfd('coração'),
} as const;

/**
 * O par de controle: acento **conta**, então estes dois NÃO podem casar.
 *
 * É o que separa "normalizar a forma do acento" de "ignorar o acento" — a
 * segunda foi recusada na spec (FR-006).
 */
export const SEM_ACENTO_VS_COM = {
  semAcento: 'ceu',
  comAcento: nfc('céu'),
} as const;

/**
 * Confere que o par realmente difere byte a byte.
 *
 * Chamado no início dos testes que dependem disso. Se algum dia o ambiente
 * normalizar as strings antes de chegarem aqui, é melhor o teste falhar
 * ruidosamente do que passar sem exercitar nada.
 */
export function ehParDistinto(par: { composta: string; decomposta: string }): boolean {
  return par.composta !== par.decomposta && par.composta.length !== par.decomposta.length;
}
