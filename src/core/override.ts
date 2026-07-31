/**
 * Override de cor por tag do tema (feature 003). Puro: sem I/O, sem relógio,
 * sem log.
 *
 * Modelo: specs/003-override-cor-por-tag/data-model.md
 *
 * A ideia inteira cabe numa frase: quando o tema em exibição porta uma tag que o
 * operador declarou na configuração, a cor declarada substitui a extraída
 * **antes** de qualquer decisão de anúncio. É a substituição acontecer cedo que
 * faz FR-010 e FR-011 valerem sem tocar no mecanismo anti-flicker — ver
 * `state.ts`.
 */

import type { Cor, Tema } from './state.ts';

/** Uma linha da seção `coresPorTag`. A coleção é ORDENADA (FR-007). */
export interface MapeamentoDeTag {
  readonly tag: string;
  readonly cor: Cor;
}

/** O veredito de um tema contra o mapeamento. Existe por ciclo, não é guardado. */
export type Casamento =
  | { readonly tipo: 'sem_mapeamento' }
  | { readonly tipo: 'sem_tema' }
  | { readonly tipo: 'sem_tags' }
  /** Tema com tags, nenhuma declarada. As tags vão ao log (FR-017). */
  | { readonly tipo: 'nenhuma_mapeada'; readonly tags: readonly string[] }
  | {
      readonly tipo: 'mapeada';
      readonly tag: string;
      readonly cor: Cor;
      /** As demais tags mapeadas do mesmo tema, em ordem de configuração (FR-007b). */
      readonly preteridas: readonly string[];
    };

export interface CorEfetiva {
  readonly cor: Cor;
  readonly origem: 'extraida' | 'mapeada';
  /** A tag responsável. `null` quando a origem é a extração. */
  readonly tag: string | null;
  /**
   * O que a extração calculou. `null` só quando ela falhou **e** havia override
   * para cobrir (FR-008a).
   *
   * Vazio aqui é informação, não ausência dela: diz que a extração falhou neste
   * ciclo, o que é diferente de ela ter coincidido com a cor declarada.
   */
  readonly extraída: Cor | null;
}

/**
 * Normaliza uma tag para comparação (FR-006, FR-006a).
 *
 * A ordem das três operações importa. `normalize` primeiro, porque as outras
 * duas operam sobre code points e uma letra decomposta é dois deles.
 *
 * **Acento continua contando**: `ceu` não vira `céu`. O que a normalização
 * resolve é outra coisa — as duas grafias Unicode do MESMO acento, que são o
 * mesmo texto na tela e strings diferentes na memória. Sem isso, uma tag
 * acentuada digitada no Holyrics e outra digitada no editor de configuração
 * podem nunca casar, e nem o log de tag não mapeada denunciaria: ele mostraria
 * as duas lado a lado, idênticas aos olhos.
 */
export function normalizarTag(tag: string): string {
  return tag.normalize('NFC').trim().toLowerCase();
}

/**
 * Compara as tags do tema contra o mapeamento declarado.
 *
 * ⚠️ **SUPOSIÇÃO NÃO VERIFICADA (Princípio I).** Nenhum tema **com** tag foi
 * observado nesta instalação: a verificação de 2026-07-28 contra o Holyrics
 * 2.29.1 encontrou `tags: []` em todos os temas. O que está confirmado é que o
 * campo vem sempre, como array de strings, nunca ausente — o **conteúdo** de uma
 * tag nunca foi visto. Seguem em aberto:
 *
 *   1. A tag chega como o operador digitou, sem espaço de sobra?
 *   2. O Holyrics preserva o acento ao salvar, ou o remove?
 *   3. Cada tag é uma entrada da lista, ou vem tudo numa string com vírgulas?
 *
 * A (1) está coberta pelo `trim` e a (2) parcialmente pela normalização — se o
 * Holyrics apenas gravar noutra forma Unicode, casa; se **remover** o acento,
 * FR-006 promete o que não pode cumprir e a spec é que precisa mudar. A (3)
 * quebraria o casamento em silêncio.
 *
 * Resolver: cenário 0 de specs/003-override-cor-por-tag/quickstart.md, que é
 * pré-requisito de todo cenário com Holyrics. A própria feature é o instrumento:
 * o log de FR-017 mostra as tags observadas antes de existir mapeamento algum.
 *
 * A precedência é a **ordem de declaração** (FR-007): varre-se a configuração de
 * cima para baixo, não as tags do tema. É o que dá ao operador o controle da
 * especificidade num lugar só — declarar `azul-escuro` antes de `azul` basta.
 */
export function casarTag(
  tema: Tema | null,
  mapeamentos: readonly MapeamentoDeTag[],
): Casamento {
  if (mapeamentos.length === 0) return { tipo: 'sem_mapeamento' };
  if (tema === null) return { tipo: 'sem_tema' };
  if (tema.tags.length === 0) return { tipo: 'sem_tags' };

  const doTema = new Set(tema.tags.map(normalizarTag));

  // Varredura na ordem da CONFIGURAÇÃO — é ela que decide o empate, não a ordem
  // das tags dentro do tema, que não aparece na tela e ninguém escolhe.
  const casaram = mapeamentos.filter((m) => doTema.has(normalizarTag(m.tag)));

  if (casaram.length === 0) {
    return { tipo: 'nenhuma_mapeada', tags: tema.tags };
  }

  const vencedor = casaram[0] as MapeamentoDeTag;
  return {
    tipo: 'mapeada',
    tag: vencedor.tag,
    cor: vencedor.cor,
    preteridas: casaram.slice(1).map((m) => m.tag),
  };
}

/**
 * Decide qual cor segue para a decisão de anúncio, e de onde ela veio.
 *
 * `extraída` é `null` quando a leitura de cor falhou ou a região configurada não
 * existia. Nesse caso o override ainda vale (FR-008a): a cor declarada não
 * depende da extração, e reter a luz por causa de uma consulta irrelevante a
 * deixaria errada sem motivo.
 *
 * Devolve `null` no único caso em que não há o que anunciar: sem extração válida
 * **e** sem override.
 *
 * Note o que esta função NÃO decide: se há apresentação no ar. Essa fronteira é
 * de quem chama (FR-014a), e mantê-la fora daqui é deliberado — as duas condições
 * são vizinhas e afrouxar uma não pode afrouxar a outra por descuido.
 */
export function resolverCorEfetiva(
  extraída: Cor | null,
  casamento: Casamento,
): CorEfetiva | null {
  if (casamento.tipo === 'mapeada') {
    return {
      cor: casamento.cor,
      origem: 'mapeada',
      tag: casamento.tag,
      extraída,
    };
  }

  if (extraída === null) return null;

  return { cor: extraída, origem: 'extraida', tag: null, extraída };
}

/**
 * A cor de referência vigente veio de um override?
 *
 * Existe para o **log de calibração**, não para a decisão. O ΔE registrado por
 * leitura é medido contra a referência, e a documentação dele promete "quanto a
 * extração oscila com o telão parado". Com override ativo a referência é a cor
 * declarada, então aquele número passa a medir a distância entre a extração e
 * uma cor escolhida à mão — informação legítima, mas **outra**. Quem calibrar o
 * limiar lendo aquele número sem saber disso conclui errado.
 *
 * A comparação é exata de propósito: entre a troca para um tema mapeado e a
 * confirmação por permanência, o tema já casa mas o palco ainda está na cor
 * anterior. Nesse intervalo a referência **não** é de override, e dizer que é
 * seria mentir por antecipação.
 */
export function referênciaÉDeOverride(
  referência: Cor | null,
  casamento: Casamento,
): boolean {
  if (referência === null || casamento.tipo !== 'mapeada') return false;

  const declarada = casamento.cor;
  return (
    referência.r === declarada.r &&
    referência.g === declarada.g &&
    referência.b === declarada.b
  );
}
