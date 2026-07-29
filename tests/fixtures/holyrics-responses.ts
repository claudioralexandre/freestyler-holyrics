/**
 * Respostas de exemplo do Holyrics.
 *
 * ORIGEM MISTA — leia antes de usar como referência:
 *
 *   - As fixtures até `colorMapNãoÉArray` vieram da DOCUMENTAÇÃO pública e são
 *     mantidas de propósito: o formato que elas descrevem é o que a
 *     documentação promete, e é justamente o que o Holyrics real NÃO manda.
 *   - As fixtures marcadas "OBSERVADAS" foram capturadas do Holyrics 2.29.1 em
 *     2026-07-28 e são a referência verdadeira.
 *
 * Contrato: specs/001-leitura-cor-holyrics/contracts/holyrics-api.md
 */

/** Array de 8 posições — o formato que GetColorMap devolve (não regiões nomeadas). */
export const colorMapOk = {
  status: 'ok',
  data: [
    { hex: '0000FF', red: 0, green: 0, blue: 255 },
    { hex: '0000EE', red: 0, green: 0, blue: 238 },
    { hex: '1010FF', red: 16, green: 16, blue: 255 },
    { hex: '000080', red: 0, green: 0, blue: 128 },
    { hex: 'FFFFFF', red: 255, green: 255, blue: 255 },
    { hex: '000000', red: 0, green: 0, blue: 0 },
    { hex: '0020FF', red: 0, green: 32, blue: 255 },
    { hex: '0000C0', red: 0, green: 0, blue: 192 },
  ],
};

/** Menos de 8 posições — exercita a região inexistente (FR-002a). */
export const colorMapCurto = {
  status: 'ok',
  data: [{ hex: 'FF0000', red: 255, green: 0, blue: 0 }],
};

export const colorMapComponenteForaDaFaixa = {
  status: 'ok',
  data: [{ hex: '??????', red: 300, green: 0, blue: 0 }],
};

export const colorMapNãoÉArray = { status: 'ok', data: { hex: '0000FF' } };

// ---------------------------------------------------------------------------
// OBSERVADAS no Holyrics 2.29.1 (Windows 10) em 2026-07-28.
// Diferem da documentação: o campo do vermelho chama-se `reg`, não `red`, e o
// do hexadecimal `hexa`, não `hex`. As fixtures acima ficam como registro do
// que a documentação prometia — são o motivo de a leitura nunca ter funcionado.
// ---------------------------------------------------------------------------

/** GetColorMap com apresentação em exibição: 8 posições, campos `hexa`/`reg`. */
export const colorMapReal = {
  status: 'ok',
  data: [
    { hexa: 'FF0024', reg: 255, green: 0, blue: 36 },
    { hexa: 'FF0024', reg: 255, green: 0, blue: 36 },
    { hexa: 'FF0024', reg: 255, green: 0, blue: 36 },
    { hexa: 'FF0024', reg: 255, green: 0, blue: 36 },
    { hexa: 'FF0024', reg: 255, green: 0, blue: 36 },
    { hexa: 'FF0024', reg: 255, green: 0, blue: 36 },
    { hexa: 'FF0024', reg: 255, green: 0, blue: 36 },
    { hexa: 'FF0024', reg: 255, green: 0, blue: 36 },
  ],
};

/** GetColorMap sem apresentação: `data: null`, não array vazio. */
export const colorMapNulo = { status: 'ok', data: null };

/** Token errado: HTTP 401 com esta mensagem. */
export const erroTokenInvalido = { status: 'error', error: 'invalid token' };

/** Token válido, action sem permissão: HTTP 401 com mensagem diferente. */
export const erroActionNaoAutorizada = {
  status: 'error',
  error: 'unauthorized action',
};

export const presentationOk = {
  status: 'ok',
  data: {
    id: 'abc123',
    type: 'song',
    name: 'Grande é o Senhor',
    slide_number: 1,
    total_slides: 10,
    slide_type: 'default',
    slides: [],
  },
};

/** Item sem noção de slide — imagem, vídeo. */
export const presentationSemSlides = {
  status: 'ok',
  data: {
    id: 'img-7',
    type: 'image',
    name: 'aviso.png',
    slide_type: 'default',
  },
};

/** Sem apresentação: estado legítimo, não é erro (FR-003). */
export const presentationNula = { status: 'ok', data: null };

export const themeOk = {
  status: 'ok',
  data: {
    id: '123',
    type: 'theme',
    name: 'Círculo Azul',
    tags: ['circle', 'blue'],
    bpm: 80,
  },
};

export const themeSemTags = {
  status: 'ok',
  data: { id: '124', type: 'theme', name: 'Sem etiquetas' },
};

export const themeNulo = { status: 'ok', data: null };

/**
 * Envelope de erro. ⚠️ A string exata para token recusado NÃO foi verificada —
 * é a maior incerteza do contrato (FR-017).
 */
export const erroTokenInválido = { status: 'error', error: 'invalid token' };

export const erroGenérico = { status: 'error', error: 'action failed' };
