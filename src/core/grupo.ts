/**
 * Decisões sobre o grupo seguidor. Puro: sem I/O, sem relógio, sem log.
 *
 * O integrador nunca conhece endereço DMX nem offset de canal — quem sabe o
 * patch é o Freestyler. Aqui só se resolve um nome para uma posição e se decide
 * se o comando de seleção precisa mesmo ser enviado.
 */

/** Um grupo do Freestyler que o nome configurado conseguiu identificar. */
export interface GrupoResolvido {
  readonly nomeConfigurado: string;
  readonly nomeReal: string;
  /** 1-based, como o Freestyler numera. Detalhe interno (FR-009a). */
  readonly posição: number;
}

export type ResolucaoDeGrupo =
  | { readonly ok: true; readonly valor: GrupoResolvido }
  | {
      readonly ok: false;
      readonly motivo: 'nao_encontrado' | 'ambiguo';
      /** Alimenta a mensagem de log de FR-010 e FR-009c. */
      readonly candidatos: readonly string[];
    };

/**
 * Normaliza para comparação: ignora caixa e espaços nas pontas.
 *
 * **Acento continua contando** (FR-009b). Tolerar caixa e espaço cobre os dois
 * enganos comuns de quem digita o nome olhando a tela do Freestyler; tolerar
 * acento começaria a aproximar nomes distintos, e a mensagem de erro já resolve
 * o resto mostrando os nomes reais.
 */
function normalizar(nome: string): string {
  return nome.trim().toLowerCase();
}

/**
 * Casa o nome configurado contra os nomes que o Freestyler respondeu.
 *
 * `grupos` vem de `FSBC008000` e tem posições vazias — a instalação de
 * referência usa 5 dos 24 espaços. Posição vazia nunca casa, nem quando o nome
 * configurado também é vazio.
 */
export function resolverGrupo(
  nomeConfigurado: string,
  grupos: readonly string[],
): ResolucaoDeGrupo {
  const alvo = normalizar(nomeConfigurado);
  const existentes = grupos.filter((g) => g.trim() !== '');

  if (alvo === '') {
    return { ok: false, motivo: 'nao_encontrado', candidatos: existentes };
  }

  const casaram: GrupoResolvido[] = [];
  for (let i = 0; i < grupos.length; i++) {
    const nomeReal = grupos[i] as string;
    if (nomeReal.trim() === '') continue;
    if (normalizar(nomeReal) === alvo) {
      casaram.push({ nomeConfigurado, nomeReal, posição: i + 1 });
    }
  }

  if (casaram.length === 0) {
    return { ok: false, motivo: 'nao_encontrado', candidatos: existentes };
  }

  if (casaram.length > 1) {
    // Escolher um em silêncio seria pior que não comandar (FR-009c).
    return { ok: false, motivo: 'ambiguo', candidatos: casaram.map((c) => c.nomeReal) };
  }

  return { ok: true, valor: casaram[0] as GrupoResolvido };
}

/**
 * Decide se o comando de grupo deve ser enviado.
 *
 * **O comando é toggle, não seleção** — verificado contra FreeStyler 4.1.7.
 * Enviado com o grupo já ativo, ele DESLIGA. Enviar "por garantia" antes de cada
 * aplicação de cor apagaria a luz em toda aplicação par, e o sintoma no palco
 * seria piscada sem causa aparente.
 *
 * Ler o status antes e só enviar quando necessário é o que torna a operação
 * idempotente.
 *
 * Não é preciso desativar outro grupo antes: a seleção é **exclusiva**, também
 * verificado (FR-012a-2).
 */
export function precisaSelecionar(
  posição: number,
  statusDosGrupos: readonly boolean[],
): boolean {
  return statusDosGrupos[posição - 1] !== true;
}
