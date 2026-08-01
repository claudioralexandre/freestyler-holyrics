/**
 * Mescla a submissão da página sobre o JSON bruto do disco (004/FR-023, FR-025).
 *
 * Puro. Não lê arquivo, não valida — a validação já aconteceu antes, com a
 * mesma função que valida o arquivo na subida (FR-011).
 *
 * **Por que mesclar em vez de serializar o `Config` validado:** o esquema `zod`
 * do projeto usa objetos comuns, e `safeParse` descarta chaves desconhecidas.
 * Gravar `JSON.stringify(config)` apagaria comentários estruturados, campos de
 * features futuras e anotações postas à mão — em silêncio. Mesclar é o que faz a
 * FR-010 ("todos os campos editáveis") e a FR-025 ("preserve o que não exibe")
 * pararem de se contradizer: a página exibe tudo que o **esquema** conhece, e
 * preserva tudo que ele não conhece.
 */

type Registro = Record<string, unknown>;

function éRegistro(v: unknown): v is Registro {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * `submetida` sobre `disco`, preservando o que a página não conhece.
 *
 * Quatro regras, e a última é a que resolve a ambiguidade central:
 *
 * 1. Chave só no disco, em qualquer profundidade → preservada.
 * 2. Chave nos dois, ambas objeto → mescla recursiva.
 * 3. **Array → substituído inteiro, nunca fundido.** Fundir posição a posição
 *    faria remover uma entrada de `coresPorTag` não remover nada, e a ordem —
 *    que na 003 é a regra de precedência — viraria resultado de uma fusão que
 *    ninguém escreveu.
 * 4. **No topo**, chave que a página conhece e não submeteu → **removida**.
 *
 * A regra 4 existe porque omissão e remoção seriam indistinguíveis sem ela. A
 * página omite `_leia-me` por não saber que ele existe, e omite `freestyler`
 * para desligar a saída DMX — que é a única forma de desligá-la (002/FR-008a).
 * `chavesConhecidas` é o que separa os dois casos.
 *
 * A lista chega por parâmetro, e não de um import do esquema, porque `core/` não
 * importa de `adapters/`. Quem chama sabe o esquema; esta função só precisa
 * saber onde traçar a linha.
 */
export function mesclarConfig(
  disco: Registro,
  submetida: Registro,
  chavesConhecidas: readonly string[] = [],
): Registro {
  const conhecidas = new Set(chavesConhecidas);
  const saída: Registro = {};

  for (const [chave, valor] of Object.entries(disco)) {
    if (chave in submetida) {
      saída[chave] = mesclarValor(valor, submetida[chave]);
      continue;
    }
    // Conhecida e ausente da submissão: remoção deliberada (regra 4).
    if (conhecidas.has(chave)) continue;
    // Desconhecida: a página nem sabia que existia. Preservada (FR-025).
    saída[chave] = structuredClone(valor);
  }

  for (const [chave, valor] of Object.entries(submetida)) {
    if (!(chave in disco)) saída[chave] = structuredClone(valor);
  }

  return saída;
}

function mesclarValor(doDisco: unknown, daSubmissão: unknown): unknown {
  if (éRegistro(doDisco) && éRegistro(daSubmissão)) {
    return mesclarObjetos(doDisco, daSubmissão);
  }
  // Array e escalar: o submetido vence inteiro. Ver regra 3 acima.
  return structuredClone(daSubmissão);
}

function mesclarObjetos(disco: Registro, submetida: Registro): Registro {
  const saída: Registro = {};

  for (const [chave, valor] of Object.entries(disco)) {
    saída[chave] = chave in submetida
      ? mesclarValor(valor, submetida[chave])
      : structuredClone(valor);
  }

  for (const [chave, valor] of Object.entries(submetida)) {
    if (!(chave in disco)) saída[chave] = structuredClone(valor);
  }

  return saída;
}
