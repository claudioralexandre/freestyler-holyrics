/**
 * Orquestra a saída DMX: assina os eventos da 001, pergunta ao núcleo o que
 * fazer, e faz.
 *
 * Nem puro nem tradução — é a camada que junta as duas. Toda decisão vem de
 * `core/saida.ts` e `core/grupo.ts`; aqui só há sequenciamento, I/O e log.
 */

import type { Logger } from 'pino';
import { CODIGO, comandoDeCor, comandoDeGrupo } from '../adapters/freestyler/protocolo.ts';
import type { ClienteFreestyler } from '../adapters/freestyler/client.ts';
import { resolverGrupo } from '../core/grupo.ts';
import {
  aplicarEvento,
  estadoInicial,
  planejarEnvio,
  type EstadoDaSaída,
  type LeituraDaMesa,
  type ParâmetrosDaSaída,
} from '../core/saida.ts';
import type { Evento } from '../core/events.ts';
import type { Cor } from '../core/state.ts';

export interface OpçõesDaSaída {
  readonly cliente: ClienteFreestyler;
  readonly parâmetros: ParâmetrosDaSaída;
  readonly log: Logger;
}

export interface SaídaDMX {
  /** Consome um evento da 001 e, se houver o que fazer, faz. */
  aoEvento(evento: Evento): Promise<void>;
  /** Invalida o grupo resolvido — usar depois de reconectar (FR-011). */
  invalidarGrupo(): void;
  estado(): EstadoDaSaída;
}

const RÓTULO_SLOT = ['vermelho', 'verde', 'azul'] as const;

export function criarSaídaDMX(opções: OpçõesDaSaída): SaídaDMX {
  const { cliente, parâmetros, log } = opções;

  let estado = estadoInicial();
  let emAndamento: Promise<void> = Promise.resolve();
  let avisouEspera = false;
  let últimaFalhaDeResolução = '';

  async function lerMesa(): Promise<LeituraDaMesa | null> {
    const grupos = await cliente.consultar(CODIGO.nomesDeGrupos);
    if (!grupos.ok) return null;
    const status = await cliente.consultar(CODIGO.statusDeGrupos);
    if (!status.ok) return null;

    return {
      grupos: grupos.valor.campos,
      // Qualquer coisa diferente de "1" conta como inativo: o protocolo não
      // documenta outros valores e supor otimista aqui apagaria a luz.
      statusDosGrupos: status.valor.campos.map((c) => c.trim() === '1'),
    };
  }

  function relatarFalhaDeResolução(chave: string, mensagem: string, extra: object): void {
    // Só relata quando a condição muda — senão um culto inteiro vira a mesma
    // linha repetida (FR-011b).
    if (chave === últimaFalhaDeResolução) return;
    últimaFalhaDeResolução = chave;
    log.warn(extra, mensagem);
  }

  function escreverCor(cor: Cor): boolean {
    const r = cliente.enviar(comandoDeCor(cor));
    if (!r.ok) {
      log.warn(
        { motivo: r.motivo, detalhe: r.detalhe, pretendida: cor, escrita: estado.últimoConjuntoEscrito },
        'falha ao escrever a cor — pretendida e escrita divergem',
      );
      return false;
    }

    log.debug(
      {
        corDeOrigem: cor,
        grupo: estado.grupo?.nomeReal,
        slots: { [RÓTULO_SLOT[0]]: cor.r, [RÓTULO_SLOT[1]]: cor.g, [RÓTULO_SLOT[2]]: cor.b },
      },
      'cor escrita',
    );
    return true;
  }

  /**
   * Executa o plano até não haver mais o que fazer.
   *
   * Roda em laço porque cada ação muda o estado e pode habilitar a próxima —
   * ler a mesa habilita resolver o grupo, que habilita selecionar, que habilita
   * escrever. O teto de voltas evita laço infinito se algo não convergir.
   */
  async function executarPlano(): Promise<void> {
    let mesa: LeituraDaMesa | null = null;

    for (let volta = 0; volta < 6; volta++) {
      const ações = planejarEnvio(estado, mesa);
      if (ações.length === 0) return;

      for (const ação of ações) {
        if (ação === 'ler_mesa') {
          mesa = await lerMesa();
          if (mesa === null) return; // Freestyler fora do ar: a divergência fica
          break;
        }

        if (ação === 'resolver_grupo') {
          const r = resolverGrupo(parâmetros.nomeDoGrupo, (mesa as LeituraDaMesa).grupos);
          if (!r.ok) {
            relatarFalhaDeResolução(
              `${r.motivo}:${parâmetros.nomeDoGrupo}`,
              r.motivo === 'ambiguo'
                ? 'mais de um grupo casa com o nome configurado — nenhuma luz será comandada'
                : 'grupo configurado não existe no Freestyler — nenhuma luz será comandada',
              { procurado: parâmetros.nomeDoGrupo, encontrados: r.candidatos },
            );
            return;
          }
          últimaFalhaDeResolução = '';
          estado = { ...estado, grupo: r.valor };
          log.info(
            { grupo: r.valor.nomeReal, posição: r.valor.posição },
            'grupo seguidor resolvido',
          );
          break;
        }

        if (ação === 'garantir_selecao') {
          const envio = cliente.enviar(comandoDeGrupo((estado.grupo as { posição: number }).posição));
          if (!envio.ok) return;
          continue;
        }

        if (ação === 'confirmar_selecao') {
          // A seleção é a única coisa que este protocolo confirma (FR-015c).
          // Escrever cor sem saber qual grupo está ativo é como a cor vaza.
          const novo = await lerMesa();
          if (novo === null) return;
          mesa = novo;
          const posição = (estado.grupo as { posição: number }).posição;
          if (novo.statusDosGrupos[posição - 1] !== true) {
            log.warn({ grupo: estado.grupo?.nomeReal }, 'seleção de grupo não confirmada');
            return;
          }
          continue;
        }

        if (ação === 'escrever_cor') {
          const cor = estado.corPretendida as Cor;
          if (!escreverCor(cor)) return;
          // Só avança depois que TODOS os comandos saíram (FR-029).
          estado = { ...estado, últimoConjuntoEscrito: cor };
          return;
        }
      }
    }
  }

  return {
    estado: () => estado,

    invalidarGrupo() {
      estado = { ...estado, grupo: null };
      últimaFalhaDeResolução = '';
    },

    aoEvento(evento) {
      estado = aplicarEvento(estado, evento, parâmetros);

      if (!estado.jáHouveCor) {
        if (!avisouEspera) {
          avisouEspera = true;
          // Sem esta linha, "ainda não houve apresentação" e "integrador
          // quebrado" produzem exatamente o mesmo sintoma: nada acontece.
          log.info(
            {},
            'aguardando a primeira cor anunciada — nada será comandado no Freestyler até lá',
          );
        }
        return Promise.resolve();
      }

      // Envios serializados: nenhum começa antes de o anterior terminar
      // (FR-016). A cor mais recente prevalece porque `estado` é lido dentro do
      // plano, não capturado aqui (FR-017).
      emAndamento = emAndamento.then(executarPlano).catch((e: unknown) => {
        log.error({ erro: e instanceof Error ? e.message : String(e) }, 'falha no ciclo de saída');
      });
      return emAndamento;
    },
  };
}
