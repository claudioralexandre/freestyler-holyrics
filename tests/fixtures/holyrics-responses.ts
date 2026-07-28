/**
 * Respostas de exemplo do Holyrics.
 *
 * ⚠️ ORIGEM: documentação pública, NÃO observação da ferramenta real.
 * Contrato: specs/001-leitura-cor-holyrics/contracts/holyrics-api.md
 *
 * Quando a verificação contra o Holyrics real acontecer, estas fixtures devem
 * ser substituídas pelas respostas realmente observadas.
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
