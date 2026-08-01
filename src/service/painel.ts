/**
 * A configuração viva e o caminho de escrita do painel.
 *
 * Requisitos: 004/FR-011 (mesma validação), FR-012 e FR-013 (recusa por
 * inteiro), FR-016 (erro sem eco de valor), FR-016a (sobreposição de ambiente),
 * FR-017 e FR-018 (recarga a quente por efeito), FR-022 (log dos campos),
 * FR-023 e FR-023a (o arquivo é a verdade, e só a página recarrega a quente),
 * FR-024 a FR-027 (gravação atômica, conflito, falha).
 *
 * **Nem puro, nem tradução de formato.** É composição: junta o núcleo da recarga
 * (`core/recarga.ts`, `core/mesclagem.ts`), a validação que já existia
 * (`adapters/config.ts`) e a gravação (`adapters/config-escrita.ts`). Nenhuma
 * decisão nova nasce aqui — o que nasce é a ordem em que elas acontecem.
 */

import {
  gravarAtomicamente,
  hashDoArquivo,
  lerArquivoBruto,
} from '../adapters/config-escrita.ts';
import { validarConfig, type Ambiente, type Config } from '../adapters/config.ts';
import { camposAlterados, efeitosDe, type Efeito } from '../core/recarga.ts';
import { mesclarConfig } from '../core/mesclagem.ts';
import type { Logger } from '../adapters/logger.ts';
import type { RespostaDeSubmissão } from '../adapters/painel/servidor.ts';
import type { Runtime } from './runtime.ts';

/**
 * Chaves de topo que o esquema conhece.
 *
 * É o que separa "a página não sabe que isto existe" — e então preserva — de
 * "a página está removendo isto de propósito" (FR-025). Sem a lista, apagar o
 * bloco `freestyler`, única forma de desligar a saída DMX, seria indistinguível
 * de omitir um comentário estruturado.
 */
const CHAVES_CONHECIDAS = [
  'holyrics',
  'leitura',
  'cor',
  'coresPorTag',
  'reconexao',
  'freestyler',
  'log',
  'painel',
] as const;

/** O que substitui "configuração é constante durante a vida do processo". */
export interface ConfiguraçãoViva {
  readonly atual: Config;
  /** O JSON como está no disco, com as chaves que o esquema não conhece. */
  readonly bruto: Record<string, unknown>;
  /**
   * O texto exato gravado, byte a byte.
   *
   * Guardado para que desfazer uma recarga recusada reescreva **o mesmo
   * arquivo**, e não uma reserialização com espaçamento diferente — que mudaria
   * o hash e faria a submissão seguinte bater num conflito fantasma.
   */
  readonly conteúdo: string;
  readonly hash: string;
  readonly caminho: string;
}

export interface OpçõesDoPainel {
  readonly inicial: ConfiguraçãoViva;
  readonly runtime: Runtime;
  readonly ambiente: Ambiente;
  readonly log: Logger;
  /**
   * Aplica os efeitos de uma recarga aceita.
   *
   * Devolve os efeitos **recusados**: hoje só `re_servir_painel` pode recusar,
   * quando o endereço novo não abre (FR-018a). Recusa aqui significa que a
   * submissão inteira não vale — a gravação é desfeita pelo chamador.
   */
  readonly aplicarEfeitos: (
    efeitos: readonly Efeito[],
    nova: Config,
  ) => Promise<readonly Efeito[]>;
}

export interface Painel {
  estado(): unknown;
  configuração(): unknown;
  submeter(corpo: unknown): Promise<RespostaDeSubmissão>;
  /** A configuração que está valendo agora. */
  viva(): ConfiguraçãoViva;
}

interface Submissão {
  readonly config?: unknown;
  readonly hashBase?: unknown;
  readonly forcar?: unknown;
}

export function criarPainel(opções: OpçõesDoPainel): Painel {
  const { runtime, ambiente, log, aplicarEfeitos } = opções;
  let viva = opções.inicial;

  /**
   * Caminhos sobrepostos por variável de ambiente (FR-016a).
   *
   * O ambiente continua vencendo — a precedência faz parte da validação que a
   * FR-011 manda reaproveitar, e inverter só neste caminho daria duas regras
   * conforme quem editou. O defeito a corrigir não é a precedência: é ela ser
   * invisível.
   */
  function sobreposições(): readonly string[] {
    const nível = ambiente.LOG_LEVEL;
    return nível !== undefined && nível !== '' ? ['log.nivel'] : [];
  }

  /**
   * `true` quando o disco difere do que está em execução (FR-023a).
   *
   * Edição à mão **não** recarrega a quente. Sem este sinal, o operador leria no
   * formulário um valor que a cor efetiva ao lado não está usando — a mesma
   * divergência silenciosa que a FR-023 existe para evitar.
   */
  function discoDivergente(): boolean {
    const atual = hashDoArquivo(viva.caminho);
    return atual !== null && atual !== viva.hash;
  }

  function corpoDaConfiguração(): unknown {
    return {
      // `Config` nunca conteve o token: `carregarConfig` o devolve ao lado, não
      // dentro (FR-015). Não há campo a omitir aqui — a garantia é estrutural.
      config: viva.atual,
      hash: viva.hash,
      caminho: viva.caminho,
      discoDivergente: discoDivergente(),
      sobreposiçõesDeAmbiente: sobreposições(),
    };
  }

  async function submeter(corpo: unknown): Promise<RespostaDeSubmissão> {
    const s = (corpo ?? {}) as Submissão;

    if (typeof s.config !== 'object' || s.config === null || Array.isArray(s.config)) {
      return { status: 422, corpo: { erro: 'invalida', detalhe: 'config: precisa ser um objeto' } };
    }

    // 1. Validação PRIMEIRO, e com a MESMA função da subida (FR-011).
    //
    // Antes da checagem de hash de propósito: uma submissão inválida deve ser
    // recusada como inválida, não como conflito. O operador precisa saber o que
    // digitou errado antes de decidir de quem é a versão que vale.
    const validada = validarConfig(s.config, ambiente);
    if (!validada.ok) {
      // `erro` traz caminho do campo e problema, nunca o valor recebido — é o
      // formatador que a 001 já usava para não vazar credencial em log (FR-016).
      return { status: 422, corpo: { erro: 'invalida', detalhe: validada.erro } };
    }

    // 2. Hash contra o disco AGORA (FR-026). Conferir no recebimento deixaria
    //    aberta a janela entre validar e escrever.
    const hashAtual = hashDoArquivo(viva.caminho);
    if (hashAtual !== null && hashAtual !== s.hashBase && s.forcar !== true) {
      return { status: 409, corpo: { erro: 'conflito', hashAtual } };
    }

    // 3. Mesclagem sobre o bruto do DISCO, não sobre o bruto em memória: quem
    //    forçou a sobrescrita ainda merece manter as chaves desconhecidas que
    //    outra pessoa acrescentou (FR-025).
    const doDisco = lerArquivoBruto(viva.caminho);
    const base = doDisco.ok ? doDisco.valor.bruto : viva.bruto;
    const mesclada = mesclarConfig(base, s.config as Record<string, unknown>, CHAVES_CONHECIDAS);

    // 4. O que muda, e o que isso obriga.
    //
    // ⚠️ Comparação entre as configurações **validadas**, não entre os JSON
    // crus. É o que impede um falso positivo grosseiro: o esquema materializa
    // padrões (o bloco `painel` inteiro, quando o arquivo não o traz), então
    // comparar o cru com o mesclado acusaria "o painel mudou" na primeira
    // gravação de qualquer instalação — e dispararia um `re_servir_painel` que
    // ninguém pediu.
    //
    // Chave que o esquema não conhece some dos dois lados e não gera efeito, o
    // que está correto: ela não tem efeito nenhum sobre o serviço. O caso que a
    // FR-018 quer flagrar — campo NOVO do esquema, sem entrada na tabela —
    // continua aparecendo, porque ele existe no `Config`.
    const campos = camposAlterados(
      viva.atual as unknown as Record<string, unknown>,
      validada.valor as unknown as Record<string, unknown>,
    );
    const efeitos = efeitosDe(campos);

    // FR-019: nada mudou, nada acontece. Nem gravação, nem efeito colateral.
    if (campos.length === 0) {
      return { status: 200, corpo: { hash: viva.hash, camposAlterados: [], efeitos: [] } };
    }

    // 5. Gravação atômica (FR-024).
    const texto = `${JSON.stringify(mesclada, null, 2)}\n`;
    const gravação = gravarAtomicamente(viva.caminho, texto);
    if (!gravação.ok) {
      log.error({ caminho: viva.caminho, erro: gravação.erro }, 'falha ao gravar a configuração');
      // A configuração em execução continua sendo a anterior — nunca uma
      // mistura (FR-027).
      return { status: 500, corpo: { erro: 'gravacao', detalhe: gravação.erro } };
    }

    const anterior = viva;
    viva = {
      atual: validada.valor,
      bruto: mesclada,
      conteúdo: texto,
      hash: gravação.hash,
      caminho: anterior.caminho,
    };

    // 6. Aplicação dos efeitos.
    const recusados = await aplicarEfeitos(efeitos, validada.valor);
    if (recusados.length > 0) {
      // Só o painel recusa hoje, e recusar significa que o endereço novo não
      // abriu (FR-018a). Voltar atrás por inteiro é o que impede a submissão de
      // ficar meio aplicada (FR-012).
      //
      // Reescreve o conteúdo EXATO de antes, e não uma reserialização: um
      // espaçamento diferente mudaria o hash e a submissão seguinte bateria num
      // conflito que ninguém causou.
      gravarAtomicamente(anterior.caminho, anterior.conteúdo);
      viva = anterior;
      log.warn({ efeitos: recusados }, 'recarga desfeita: efeito recusado');
      return {
        status: 500,
        corpo: {
          erro: 'gravacao',
          detalhe: `não foi possível aplicar: ${recusados.join(', ')}. Nada foi alterado`,
        },
      };
    }

    // FR-022: nomeia QUAIS campos mudaram, nunca o arquivo inteiro.
    log.info({ campos, efeitos }, `configuração recarregada: ${campos.length} campo(s)`);

    // Um campo acrescentado numa feature futura seria aceito, gravado e não
    // valeria nada. O efeito nomeado é o que transforma isso numa linha de log.
    if (efeitos.includes('desconhecido')) {
      log.warn(
        { campos },
        'campo alterado sem efeito conhecido — foi gravado, mas pode não estar valendo',
      );
    }

    return { status: 200, corpo: { hash: viva.hash, camposAlterados: campos, efeitos } };
  }

  return {
    viva: () => viva,
    configuração: corpoDaConfiguração,
    estado() {
      return {
        estado: runtime.snapshot(),
        ...(corpoDaConfiguração() as Record<string, unknown>),
      };
    },
    submeter,
  };
}
