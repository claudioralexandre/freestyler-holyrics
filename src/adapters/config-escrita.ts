/**
 * Leitura bruta, hash e gravação atômica do arquivo de configuração.
 *
 * Requisitos: 004/FR-024 (gravação atômica), FR-026 (detecção de conflito),
 * FR-027 (falha reportada sem alterar o que está valendo).
 *
 * Adaptador fino: nenhuma regra de negócio mora aqui. A decisão sobre o que
 * gravar é da mesclagem (`src/core/mesclagem.ts`); esta camada só põe bytes no
 * disco sem deixar meio-termo.
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export interface ArquivoLido {
  /** O conteúdo cru, como está no disco. */
  readonly conteúdo: string;
  /** O JSON já analisado, com as chaves que o esquema não conhece (FR-025). */
  readonly bruto: Record<string, unknown>;
  /** SHA-256 do conteúdo. Base da detecção de conflito (FR-026). */
  readonly hash: string;
}

export type ResultadoDeLeitura =
  | { readonly ok: true; readonly valor: ArquivoLido }
  | { readonly ok: false; readonly erro: string };

export type ResultadoDeGravação =
  | { readonly ok: true; readonly hash: string }
  | { readonly ok: false; readonly erro: string };

/**
 * SHA-256 do conteúdo, em hexadecimal.
 *
 * **Conteúdo, e não mtime.** A granularidade de mtime é de um segundo em alguns
 * sistemas de arquivo, e o caso que a FR-026 cobre é justamente o de duas
 * escritas próximas. O arquivo tem poucos kilobytes: o hash é irrelevante em
 * custo e exato em resultado.
 */
export function hashDoConteúdo(conteúdo: string): string {
  return createHash('sha256').update(conteúdo, 'utf8').digest('hex');
}

/** Lê o arquivo cru, sem validar. Validar é de quem chama (FR-011). */
export function lerArquivoBruto(caminho: string): ResultadoDeLeitura {
  let conteúdo: string;
  try {
    conteúdo = readFileSync(caminho, 'utf8');
  } catch {
    return { ok: false, erro: `arquivo de configuração ilegível: ${caminho}` };
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(conteúdo);
  } catch (e) {
    return { ok: false, erro: `JSON malformado: ${(e as Error).message}` };
  }

  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    return { ok: false, erro: 'a configuração precisa ser um objeto JSON' };
  }

  return {
    ok: true,
    valor: { conteúdo, bruto: bruto as Record<string, unknown>, hash: hashDoConteúdo(conteúdo) },
  };
}

/** Hash do que está no disco AGORA, para a checagem de conflito (FR-026). */
export function hashDoArquivo(caminho: string): string | null {
  try {
    return hashDoConteúdo(readFileSync(caminho, 'utf8'));
  } catch {
    return null;
  }
}

const TENTATIVAS = 5;
const ESPERA_MS = 40;

/**
 * Grava de forma atômica: temporário no mesmo diretório → `fsync` → `rename`.
 *
 * **Mesmo diretório, não `%TEMP%`.** `rename` só é atômico dentro do mesmo
 * volume; um temporário em outro volume degradaria para cópia, que é exatamente
 * o meio-termo que a FR-024 proíbe.
 *
 * **`fsync` antes do `rename`.** Sem ele, uma queda de energia pode deixar um
 * arquivo novo com o tamanho certo e conteúdo vazio — o serviço não sobe, e um
 * ajuste de cor vira um culto sem integrador (SC-006).
 *
 * ⚠️ **SUPOSIÇÃO DE PLATAFORMA NÃO VERIFICADA (Princípio I).** No Windows,
 * `rename` sobre arquivo existente usa `MoveFileEx` com substituição e é
 * considerado atômico, mas **pode falhar com `EPERM`/`EBUSY`** quando antivírus
 * ou o indexador estão com o arquivo aberto naquele instante. A retentativa
 * curta abaixo cobre o caso transitório. Nada disso foi observado: o
 * desenvolvimento roda em Linux.
 *
 * Verificação pendente: cenário 30 de
 * `specs/004-painel-de-configuracao/quickstart.md`. Detalhes em
 * `specs/004-painel-de-configuracao/research.md` §8. Quando for exercitado no PC
 * do culto, este aviso sai daqui — ou vira o comportamento observado.
 */
export function gravarAtomicamente(
  caminho: string,
  conteúdo: string,
): ResultadoDeGravação {
  const temporário = join(dirname(caminho), `.config-${process.pid}-${Date.now()}.tmp`);

  try {
    const fd = openSync(temporário, 'w');
    try {
      writeSync(fd, conteúdo, 0, 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    limpar(temporário);
    return { ok: false, erro: `não foi possível escrever o arquivo temporário: ${(e as Error).message}` };
  }

  let últimoErro = '';
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      renameSync(temporário, caminho);
      return { ok: true, hash: hashDoConteúdo(conteúdo) };
    } catch (e) {
      const erro = e as NodeJS.ErrnoException;
      últimoErro = erro.message;
      // Só EPERM e EBUSY são transitórios. Insistir num ENOENT ou EACCES seria
      // gastar 200 ms para dar o mesmo erro.
      if (erro.code !== 'EPERM' && erro.code !== 'EBUSY') break;
      esperar(ESPERA_MS * tentativa);
    }
  }

  limpar(temporário);
  return { ok: false, erro: `não foi possível substituir o arquivo: ${últimoErro}` };
}

/** Espera bloqueante e curta. Só no caminho de erro, nunca no caminho quente. */
function esperar(ms: number): void {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    // Ocupada de propósito: a gravação é síncrona por inteiro, e são
    // milissegundos numa operação que já é rara.
  }
}

function limpar(temporário: string): void {
  try {
    unlinkSync(temporário);
  } catch {
    // O temporário órfão é lixo, não falha. Reportar isso confundiria o
    // operador sobre o que realmente deu errado.
  }
}
