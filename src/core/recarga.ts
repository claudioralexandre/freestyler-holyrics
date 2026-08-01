/**
 * O núcleo da recarga a quente: o que mudou, e o que isso obriga a fazer.
 *
 * Requisitos: 004/FR-018 (cada campo com o efeito dele e nenhum outro),
 * FR-019 (campo inalterado não produz efeito), FR-021 e FR-021a (só a região
 * zera a máquina de estado da cor).
 *
 * Puro. Duas funções, separadas de propósito: `camposAlterados` é mecânica —
 * comparar dois registros — e `efeitosDe` é decisão. A segunda é a que precisa
 * ser lida linha a linha contra a spec, e misturá-las esconderia isso.
 *
 * **Genérico, e não tipado em `Config`.** `core/` não importa de `adapters/`, e
 * é essa regra que permite exercitar a recarga inteira sem abrir um socket. O
 * preço é que a tabela abaixo casa caminhos por texto; o efeito `desconhecido`
 * é o que impede esse preço de virar silêncio.
 */

export type Efeito =
  /** Próximo ciclo usa o intervalo novo; o em curso termina. */
  | 'ritmo_de_leitura'
  /** Substitui `ParâmetrosDoNúcleo` do próximo ciclo. */
  | 'parametros_do_nucleo'
  /** Referência, candidata e contagem a zero. **Só** `leitura.regiao`. */
  | 'zerar_estado_de_cor'
  | 'reconectar_holyrics'
  | 'reconectar_freestyler'
  | 'reresolver_grupo'
  | 'parametros_da_saida'
  /** O bloco `freestyler` apareceu ou sumiu: monta ou desmonta a saída. */
  | 'religar_saida'
  | 'parametros_de_reconexao'
  | 'reconfigurar_log'
  | 're_servir_painel'
  /** Campo fora da tabela. Não é padrão silencioso — é alarme. */
  | 'desconhecido';

type Registro = Record<string, unknown>;

function éRegistro(v: unknown): v is Registro {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Caminhos, em texto, dos campos que diferem entre dois registros aninhados.
 *
 * Array é comparado **inteiro**, nunca posição a posição: `coresPorTag` é um
 * campo só, porque a ordem declarada é a regra de precedência (003/FR-007). Um
 * diff por posição produziria `coresPorTag.0.tag` e obrigaria a tabela de
 * efeitos a adivinhar o que fazer com cada índice.
 *
 * Bloco que aparece ou some inteiro devolve o caminho do **bloco**, não dos
 * campos dentro dele — é o que distingue "trocaram o grupo" de "ligaram a saída
 * DMX", que exigem coisas diferentes.
 */
export function camposAlterados(
  antes: Registro,
  depois: Registro,
  prefixo = '',
): readonly string[] {
  const caminhos: string[] = [];
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);

  for (const chave of chaves) {
    const caminho = prefixo === '' ? chave : `${prefixo}.${chave}`;
    const a = antes[chave];
    const d = depois[chave];

    const existiaAntes = chave in antes;
    const existeDepois = chave in depois;

    if (existiaAntes !== existeDepois) {
      caminhos.push(caminho);
      continue;
    }

    if (éRegistro(a) && éRegistro(d)) {
      caminhos.push(...camposAlterados(a, d, caminho));
      continue;
    }

    if (!mesmoValor(a, d)) caminhos.push(caminho);
  }

  return caminhos;
}

/**
 * Igualdade estrutural, suficiente para JSON de configuração.
 *
 * Não trata ciclos nem `Map`/`Set`/`Date` — nenhum deles sobrevive a
 * `JSON.parse`, que é a única origem dos valores comparados aqui.
 */
function mesmoValor(a: unknown, d: unknown): boolean {
  if (a === d) return true;
  if (Array.isArray(a) && Array.isArray(d)) {
    return a.length === d.length && a.every((v, i) => mesmoValor(v, d[i]));
  }
  if (éRegistro(a) && éRegistro(d)) {
    const ca = Object.keys(a);
    const cd = Object.keys(d);
    return ca.length === cd.length && ca.every((k) => k in d && mesmoValor(a[k], d[k]));
  }
  return false;
}

/**
 * Tabela caminho → efeitos. **Exaustiva, campo a campo, de propósito.**
 *
 * Cada entrada é uma linha da FR-018.
 *
 * ⚠️ **Casamento exato, não por prefixo, e isso não é preciosismo.** Um prefixo
 * `cor` faria `cor.campoNovo` — de uma feature futura — casar com
 * `parametros_do_nucleo` e parecer tratado. Mas `ParâmetrosDoNúcleo` é montado
 * campo a campo em `main.ts`: o campo novo seria aceito pela página, gravado no
 * arquivo, reportado como aplicado, e não valeria nada. A lista longa é o preço
 * de esse caso virar `desconhecido` em vez de mentira.
 */
const EXATOS: ReadonlyMap<string, readonly Efeito[]> = new Map([
  ['leitura.intervaloMs', ['ritmo_de_leitura']],
  // O ÚNICO caminho que zera a máquina de estado da cor (FR-021a). Ele troca a
  // procedência: a referência guardada veio de outra região da tela, e mantê-la
  // faria o ΔE seguinte comparar duas grandezas diferentes — anunciando mudança
  // que não houve, ou engolindo a que houve.
  ['leitura.regiao', ['parametros_do_nucleo', 'zerar_estado_de_cor']],
  ['cor.limiarDeltaE', ['parametros_do_nucleo']],
  ['cor.ciclosDeConfirmacao', ['parametros_do_nucleo']],
  ['coresPorTag', ['parametros_do_nucleo']],
  ['holyrics.host', ['reconectar_holyrics']],
  ['holyrics.port', ['reconectar_holyrics']],
  ['holyrics.requestTimeoutMs', ['reconectar_holyrics']],
  ['freestyler.host', ['reconectar_freestyler']],
  ['freestyler.port', ['reconectar_freestyler']],
  // Reresolver, e NÃO reconectar: derrubar o socket por um rename seria efeito
  // colateral em componente que não depende do campo alterado (FR-018).
  ['freestyler.grupo', ['reresolver_grupo']],
  ['freestyler.heartbeatTimeoutMs', ['parametros_da_saida']],
  ['freestyler.consultaTimeoutMs', ['parametros_da_saida']],
  // Só quando o bloco INTEIRO entra ou sai. Os campos de dentro têm entrada
  // própria acima, e o exato sempre vence.
  ['freestyler', ['religar_saida']],
  ['reconexao.intervaloInicialMs', ['parametros_de_reconexao']],
  ['reconexao.intervaloMaximoMs', ['parametros_de_reconexao']],
  ['log.nivel', ['reconfigurar_log']],
  ['log.arquivo', ['reconfigurar_log']],
  ['log.tamanhoMaximoMb', ['reconfigurar_log']],
  ['log.arquivosMantidos', ['reconfigurar_log']],
  ['painel', ['re_servir_painel']],
  ['painel.habilitado', ['re_servir_painel']],
  ['painel.host', ['re_servir_painel']],
  ['painel.port', ['re_servir_painel']],
]);

/**
 * As duas exceções em que a subárvore inteira casa.
 *
 * `corDeRepouso` é passada como objeto para a saída, então `.r`, `.g` e `.b` têm
 * mesmo efeito e um componente novo não existe — a cor tem três.
 */
const SUBÁRVORES: ReadonlyMap<string, readonly Efeito[]> = new Map([
  ['freestyler.corDeRepouso', ['parametros_da_saida']],
]);

function efeitoDoCaminho(caminho: string): readonly Efeito[] {
  const exato = EXATOS.get(caminho);
  if (exato !== undefined) return exato;

  for (const [raiz, efeitos] of SUBÁRVORES) {
    if (caminho === raiz || caminho.startsWith(`${raiz}.`)) return efeitos;
  }

  // Sem padrão silencioso: ver o aviso sobre casamento exato, acima.
  return ['desconhecido'];
}

/** Os efeitos que os campos alterados obrigam, sem repetição e sem ordem. */
export function efeitosDe(caminhos: readonly string[]): readonly Efeito[] {
  const efeitos = new Set<Efeito>();

  for (const caminho of caminhos) {
    for (const efeito of efeitoDoCaminho(caminho)) efeitos.add(efeito);
  }

  return [...efeitos];
}
