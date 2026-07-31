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
  /**
   * Chamar depois de reconectar ao Freestyler (FR-011, FR-020).
   *
   * Faz duas coisas, e as duas importam: esquece o grupo resolvido, porque o
   * operador pode tê-lo renomeado enquanto a mesa esteve fora; e esquece o que
   * foi escrito, porque não há como saber o que está valendo na mesa agora. A
   * divergência resultante é o que dispara a reaplicação da cor pretendida.
   */
  aoReconectar(): Promise<void>;
  /**
   * Lê e registra o inventário do Freestyler: versão, grupos, fixtures e
   * endereços (FR-025a).
   *
   * É o que substituiu a antiga ferramenta de calibração — a informação que ela
   * ia descobrir acendendo lâmpada por lâmpada está aqui, por consulta.
   */
  registrarInventário(): Promise<void>;
  /** Tenta de novo o que ficou pendente, sem esperar evento novo (FR-029a). */
  reprocessar(): Promise<void>;
  estado(): EstadoDaSaída;
}

const RÓTULO_SLOT = ['vermelho', 'verde', 'azul'] as const;

function mesmaCor(a: Cor, b: Cor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export function criarSaídaDMX(opções: OpçõesDaSaída): SaídaDMX {
  const { cliente, parâmetros, log } = opções;

  let estado = estadoInicial();
  let emAndamento: Promise<void> = Promise.resolve();
  let avisouEspera = false;
  let últimaFalhaDeResolução = '';
  /**
   * Nomes das fixtures, lidos no inventário (`FSBC017000`).
   *
   * Guardados para que a linha da seleção diga **quais** fixtures foram
   * atingidas sem custar uma consulta a mais por seleção. Vazio até o primeiro
   * inventário — aí a linha reporta posição em vez de nome.
   */
  let nomesDeFixtures: readonly string[] = [];

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

  /**
   * Registra quais fixtures a seleção efetivada atingiu (FR-025b).
   *
   * O grupo existente mas vazio produz o mesmo sintoma que o integrador
   * quebrado: luz parada. O inventário de FR-025a lista a mesa inteira e não
   * distingue os dois; esta consulta, feita logo após a seleção, distingue.
   *
   * Acontece por **seleção efetivada**, não por aplicação de cor: em um culto
   * inteiro tende a ser uma consulta só, então não entra no caminho quente
   * (FR-014).
   *
   * Falha de leitura aqui **não** aborta o ciclo. Isto é diagnóstico, não
   * pré-condição de aplicar cor — deixar a luz parada porque o log não pôde ser
   * escrito seria trocar o problema pelo pior.
   */
  async function registrarFixturesAtingidas(): Promise<void> {
    const r = await cliente.consultar(CODIGO.fixturesSelecionadas);
    if (!r.ok) {
      log.warn(
        { motivo: r.motivo, detalhe: r.detalhe, grupo: estado.grupo?.nomeReal },
        'não foi possível ler quais fixtures a seleção atingiu',
      );
      return;
    }

    // Posicional com `FSBC017000`: a n-ésima marca corresponde ao n-ésimo nome.
    const atingidas = r.valor.campos
      .map((v, i) => (v.trim() === '1' ? (nomesDeFixtures[i] ?? `#${i + 1}`) : null))
      .filter((n): n is string => n !== null);

    if (atingidas.length === 0) {
      log.warn(
        { grupo: estado.grupo?.nomeReal, fixturesAtingidas: 0 },
        'grupo seguidor existe mas está vazio — nenhuma fixture recebe a cor',
      );
      return;
    }

    log.info(
      {
        grupo: estado.grupo?.nomeReal,
        fixturesAtingidas: atingidas.length,
        fixtures: atingidas,
      },
      'seleção efetivada',
    );
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

    // Nível NORMAL: é transição de estado, e sem esta linha um culto inteiro
    // rodaria sem nada indicando que a luz foi comandada (FR-025). O detalhe
    // por slot fica em debug (FR-024).
    const emRepouso = mesmaCor(cor, parâmetros.corDeRepouso);
    log.info(
      { cor, grupo: estado.grupo?.nomeReal, repouso: emRepouso },
      emRepouso ? 'cor de repouso escrita' : 'cor escrita',
    );
    log.debug(
      {
        corDeOrigem: cor,
        grupo: estado.grupo?.nomeReal,
        slots: { [RÓTULO_SLOT[0]]: cor.r, [RÓTULO_SLOT[1]]: cor.g, [RÓTULO_SLOT[2]]: cor.b },
      },
      'detalhe do envio de cor',
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
          await registrarFixturesAtingidas();
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

  /** Enfileira um ciclo de envio. Nenhum começa antes de o anterior terminar. */
  function enfileirar(): Promise<void> {
    emAndamento = emAndamento.then(executarPlano).catch((e: unknown) => {
      log.error({ erro: e instanceof Error ? e.message : String(e) }, 'falha no ciclo de saída');
    });
    return emAndamento;
  }

  return {
    estado: () => estado,

    async registrarInventário() {
      const [versão, grupos, fixtures, endereços] = await Promise.all([
        cliente.consultar(CODIGO.versao),
        cliente.consultar(CODIGO.nomesDeGrupos),
        cliente.consultar(CODIGO.nomesDeFixtures),
        cliente.consultar(CODIGO.enderecosDeFixtures),
      ]);

      if (!grupos.ok) {
        log.warn({ detalhe: grupos.detalhe }, 'não foi possível ler o inventário do Freestyler');
        return;
      }

      const nomes = fixtures.ok ? fixtures.valor.campos : [];
      const ends = endereços.ok ? endereços.valor.campos : [];
      // Reaproveitados pela linha da seleção (FR-025b), que assim não precisa
      // consultar os nomes de novo a cada troca de grupo.
      nomesDeFixtures = nomes;

      log.info(
        {
          versão: versão.ok ? versão.valor.campos[0] : undefined,
          grupos: grupos.valor.campos.filter((g) => g.trim() !== ''),
          // Posicional: o n-ésimo nome corresponde ao n-ésimo endereço.
          fixtures: nomes.map((n, i) => `${n} @${ends[i] ?? '?'}`),
          grupoConfigurado: parâmetros.nomeDoGrupo,
        },
        'inventário do Freestyler',
      );
    },

    aoReconectar() {
      estado = { ...estado, grupo: null, últimoConjuntoEscrito: null };
      últimaFalhaDeResolução = '';
      if (!estado.jáHouveCor) return Promise.resolve();
      return enfileirar();
    },

    reprocessar() {
      if (!estado.jáHouveCor) return Promise.resolve();
      return enfileirar();
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
      return enfileirar();
    },
  };
}
