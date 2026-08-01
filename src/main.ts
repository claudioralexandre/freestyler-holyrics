/**
 * Ponto de entrada do integrador.
 *
 * Carrega configuração, monta o serviço e inicia o ciclo de leitura. A única
 * condição que impede a partida é configuração inválida (FR-020) — Holyrics
 * fechado não impede nada, e desde a 004 o painel também não: porta ocupada vai
 * para o log e o serviço opera do mesmo jeito (004/FR-004a).
 *
 * **A 004 derrubou uma premissa que atravessava este arquivo:** até ela, a
 * configuração era constante durante a vida do processo, e cada valor era
 * distribuído na subida. Agora ela é um valor vivo, e cada campo alterado produz
 * um **efeito nomeado** — nunca um "recarregar tudo", que passaria em qualquer
 * teste e falharia no culto.
 */

import { ErroDeConfiguração, carregarConfig } from './adapters/config.ts';
import {
  criarLoggerRecarregável,
  registrarEvento,
  registrarLeitura,
} from './adapters/logger.ts';
import { criarCliente } from './adapters/holyrics/client.ts';
import { hashDoConteúdo, lerArquivoBruto } from './adapters/config-escrita.ts';
import { criarServidor, type Servidor } from './adapters/painel/servidor.ts';
import { casarTag, referênciaÉDeOverride } from './core/override.ts';
import { criarPainelDeCor } from './adapters/console.ts';
import {
  ESTADO_INICIAL,
  aplicarCiclo,
  type EstadoDoServiço,
  type ParâmetrosDoNúcleo,
} from './core/state.ts';
import { próximoIntervalo } from './core/backoff.ts';
import type { Efeito } from './core/recarga.ts';
import {
  DISPONIBILIDADE_INICIAL,
  avaliarDisponibilidade,
  type EstadoDeDisponibilidade,
} from './service/availability.ts';
import { criarPoller } from './service/poller.ts';
import { criarRuntime, type Runtime } from './service/runtime.ts';
import { criarPainel, type ConfiguraçãoViva } from './service/painel.ts';
import { criarCliente as criarClienteFreestyler } from './adapters/freestyler/client.ts';
import { criarSaídaDMX } from './service/saida-dmx.ts';
import {
  DISPONIBILIDADE_INICIAL as BATIMENTO_INICIAL,
  avaliarPulso,
  registrarPulso,
} from './core/heartbeat.ts';
import type { ClienteHolyrics } from './adapters/holyrics/client.ts';
import type { Config } from './adapters/config.ts';
import type { Logger } from './adapters/logger.ts';

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ConfigFreestyler = NonNullable<Config['freestyler']>;

interface SaídaAtiva {
  fechar: () => Promise<void>;
  atualizarParâmetros: (cfg: ConfigFreestyler) => Promise<void>;
  reresolverGrupo: (cfg: ConfigFreestyler) => Promise<void>;
}

/**
 * Sobe o consumidor de eventos que comanda o Freestyler.
 *
 * Junta três coisas que precisam conviver: a assinatura dos eventos da 001, a
 * reconexão com backoff, e a vigilância por batimento — que é o que denuncia
 * uma mesa travada com o socket ainda aberto.
 *
 * Nenhuma falha do Freestyler escapa daqui para o ciclo de leitura: o culto
 * continua sendo lido mesmo com a luz muda (Princípio IV).
 */
function ligarSaídaDMX(
  cfg: ConfigFreestyler,
  runtime: Runtime,
  log: Logger,
  reconexao: { intervaloInicialMs: number; intervaloMaximoMs: number },
): SaídaAtiva {
  let batimento = BATIMENTO_INICIAL;
  let falhasConsecutivas = 0;
  let encerrando = false;
  let relógioDeAvaliação: NodeJS.Timeout | null = null;

  /**
   * Publica no runtime o que a saída sabe e o painel precisa (004/FR-005,
   * FR-009).
   *
   * Até a 003 esta informação vivia só aqui dentro, e estava certo: ninguém a
   * pedia. A página pede — e o `null` do runtime, que significa "não há saída
   * DMX configurada", depende justamente de esta função **não** ser chamada
   * quando o bloco `freestyler` está ausente.
   */
  function publicarEstadoDaSaída(): void {
    const e = saída.estado();
    runtime.atualizarSaída({
      disponível: batimento.disponível,
      grupo: e.grupo,
      gruposConhecidos: e.gruposConhecidos,
    });
  }

  const clienteFs = criarClienteFreestyler({
    host: cfg.host,
    port: cfg.port,
    // Sem prazo, uma consulta sem resposta pararia a luz por tempo
    // indeterminado: ler o status dos grupos é pré-condição de toda aplicação
    // de cor e os envios são serializados (FR-023a).
    timeoutDeConsultaMs: cfg.consultaTimeoutMs,
    aoPulso: () => {
      const anterior = batimento.disponível;
      batimento = registrarPulso(batimento, Date.now());
      // Só na transição: o pulso é de ~1499 ms e republicar a cada um seria
      // trabalho por nada.
      if (!anterior) publicarEstadoDaSaída();
    },
    // Captura temporária do stream cru, para fechar o defeito de enquadramento
    // achado em 31/07. Ver `src/adapters/freestyler/client.ts`.
    aoCapturar: (mensagem) => log.info({}, mensagem),
  });

  const saída = criarSaídaDMX({
    cliente: clienteFs,
    parâmetros: { corDeRepouso: cfg.corDeRepouso, nomeDoGrupo: cfg.grupo },
    log,
  });

  async function conectar(): Promise<void> {
    if (encerrando) return;

    const r = await clienteFs.conectar();
    if (!r.ok) {
      falhasConsecutivas++;
      const atraso = próximoIntervalo(falhasConsecutivas, reconexao);
      setTimeout(() => void conectar(), atraso).unref?.();
      return;
    }

    falhasConsecutivas = 0;
    batimento = registrarPulso(BATIMENTO_INICIAL, Date.now());
    log.info({ host: cfg.host, port: cfg.port }, 'Freestyler conectado');
    // Na subida e a cada reconexão: é o que permite diagnosticar configuração
    // errada sem abrir a mesa (FR-025a).
    await saída.registrarInventário();
    // Reverifica o grupo e esquece o que foi escrito: o operador pode ter
    // renomeado o grupo, e não há como saber o que está valendo na mesa agora
    // (FR-011, FR-020).
    await saída.aoReconectar();
    // Depois das duas: é aqui que os grupos conhecidos e o grupo resolvido
    // existem pela primeira vez.
    publicarEstadoDaSaída();
  }

  // A mesa pode travar com o socket aberto — os `write` seguiriam "funcionando"
  // para o vazio. O pulso é o único sinal que denuncia isso (FR-021a).
  relógioDeAvaliação = setInterval(() => {
    const veredito = avaliarPulso(batimento, Date.now(), cfg.heartbeatTimeoutMs);
    const anterior = batimento.disponível;
    batimento = veredito.estado;

    if (veredito.evento === 'freestyler_perdido') {
      log.warn({ host: cfg.host, port: cfg.port }, 'Freestyler não responde (sem batimento)');
      publicarEstadoDaSaída();
      if (anterior || clienteFs.conectado()) {
        clienteFs.fechar();
        void conectar();
      }
    } else if (veredito.evento === 'freestyler_recuperado') {
      log.info({}, 'Freestyler está batendo');
      publicarEstadoDaSaída();
    }

    // Reenvia o que ficou pendente mesmo sem evento novo: um comando pode ter
    // se perdido com o socket vivo (FR-029a).
    if (batimento.disponível) void saída.reprocessar();
  }, 2000);
  relógioDeAvaliação.unref?.();

  // Antes de conectar: a partir daqui `freestylerDisponível` é `false`, e não
  // mais `null`. A saída existe e está fora do ar — que é diferente de não
  // haver saída configurada (004/FR-005).
  publicarEstadoDaSaída();

  void conectar();

  const cancelar = runtime.subscribe((evento) => {
    void saída.aoEvento(evento).then(publicarEstadoDaSaída, publicarEstadoDaSaída);
  });

  log.info({ grupo: cfg.grupo, host: cfg.host, port: cfg.port }, 'saída DMX ativa');

  return {
    async atualizarParâmetros(novo) {
      await saída.atualizarParâmetros({
        corDeRepouso: novo.corDeRepouso,
        nomeDoGrupo: novo.grupo,
      });
      publicarEstadoDaSaída();
    },

    async reresolverGrupo(novo) {
      // O nome entra primeiro; a reresolução acontece dentro de
      // `atualizarParâmetros` justamente porque o grupo mudou (004/FR-018).
      await saída.atualizarParâmetros({
        corDeRepouso: novo.corDeRepouso,
        nomeDoGrupo: novo.grupo,
      });
      const e = saída.estado();
      if (e.grupo === null) {
        log.warn(
          { grupoConfigurado: novo.grupo, gruposConhecidos: e.gruposConhecidos },
          'grupo seguidor não resolvido contra a mesa',
        );
      } else {
        log.info({ grupo: e.grupo.nomeReal }, 'grupo seguidor resolvido');
      }
      publicarEstadoDaSaída();
    },

    async fechar() {
      encerrando = true;
      cancelar();
      if (relógioDeAvaliação !== null) clearInterval(relógioDeAvaliação);
      // Aguarda só o envio em curso; nenhum comando novo sai daqui (FR-028a).
      await saída.reprocessar().catch(() => undefined);
      clienteFs.fechar();
    },
  };
}

function main(): void {
  let carregada;
  try {
    carregada = carregarConfig();
  } catch (erro) {
    if (erro instanceof ErroDeConfiguração) {
      // Sem logger ainda: a mensagem vai crua para o terminal, sem stack trace.
      process.stderr.write(`\nConfiguração inválida: ${erro.message}\n\n`);
      process.exit(1);
    }
    throw erro;
  }

  const { config, token, caminho } = carregada;

  // A configuração deixa de ser constante: `cfg` é lido pelos fechamentos
  // abaixo, então trocá-lo já faz ritmo de leitura e backoff obedecerem ao valor
  // novo no ciclo seguinte (004/FR-018).
  let cfg: Config = config;

  const loggerRecarregável = criarLoggerRecarregável({ log: cfg.log, token });
  const log = loggerRecarregável.log;

  log.info(
    {
      caminho,
      holyrics: `${cfg.holyrics.host}:${cfg.holyrics.port}`,
      intervaloMs: cfg.leitura.intervaloMs,
      regiao: cfg.leitura.regiao,
      limiarDeltaE: cfg.cor.limiarDeltaE,
      ciclosDeConfirmacao: cfg.cor.ciclosDeConfirmacao,
    },
    'integrador iniciando',
  );

  const runtime = criarRuntime({
    estadoInicial: ESTADO_INICIAL,
    aoFalharOuvinte: (erro, evento) =>
      log.error(
        { erro: erro.message, evento: evento.tipo },
        'consumidor falhou ao tratar evento; ciclo segue',
      ),
  });

  // Uma linha legível por troca de cor, direto no terminal. Independe da saída
  // DMX: mesmo sem Freestyler configurado, é ela que mostra qual cor o
  // integrador assumiu — o JSON do pino não se lê de relance durante um culto.
  const painelDeCor = criarPainelDeCor();
  runtime.subscribe((evento) => painelDeCor.aoEvento(evento));

  let parâmetros: ParâmetrosDoNúcleo = parâmetrosDe(cfg);

  function parâmetrosDe(c: Config): ParâmetrosDoNúcleo {
    return {
      regiao: c.leitura.regiao,
      limiarDeltaE: c.cor.limiarDeltaE,
      ciclosDeConfirmacao: c.cor.ciclosDeConfirmacao,
      // Ausente na configuração vira lista vazia: nenhum caminho novo é
      // exercitado e o comportamento é o de antes da feature 003 (003/FR-002).
      coresPorTag: c.coresPorTag ?? [],
    };
  }

  // Na subida, para que um mapeamento esquecido no arquivo não vire fantasma:
  // a cor não obedece o telão e nada explica por quê (003/FR-016).
  if (cfg.coresPorTag !== undefined && cfg.coresPorTag.length > 0) {
    log.info(
      {
        mapeamentos: cfg.coresPorTag.length,
        tags: cfg.coresPorTag.map((m) => m.tag),
      },
      `override de cor por tag ativo: ${cfg.coresPorTag.length} mapeamento(s)`,
    );
  }

  let estado: EstadoDoServiço = ESTADO_INICIAL;
  let disponibilidade: EstadoDeDisponibilidade = DISPONIBILIDADE_INICIAL;

  // Recriável: `reconectar_holyrics` troca o cliente interno sem que o poller
  // saiba (004/FR-018). Três métodos, três linhas — não vale uma abstração.
  let clienteAtual = novoClienteHolyrics(cfg);
  const cliente: ClienteHolyrics = {
    lerCor: () => clienteAtual.lerCor(),
    lerApresentação: () => clienteAtual.lerApresentação(),
    lerTema: () => clienteAtual.lerTema(),
  };

  function novoClienteHolyrics(c: Config): ClienteHolyrics {
    return criarCliente({
      host: c.holyrics.host,
      port: c.holyrics.port,
      requestTimeoutMs: c.holyrics.requestTimeoutMs,
      token,
    });
  }

  const poller = criarPoller({
    cliente,
    agora: () => Date.now(),
    dormir,
    // Com o Holyrics atendendo, o ritmo é o intervalo configurado. Com ele
    // fora do ar, o backoff espaça as tentativas até o teto — que é menor que
    // o prazo do SC-005, para a retomada continuar dentro do prometido.
    //
    // Lê `cfg` a cada ciclo, então trocar a configuração já muda o ritmo no
    // ciclo seguinte sem abandonar a leitura em curso (004/FR-018).
    calcularAtraso: () =>
      disponibilidade.falhasConsecutivas === 0
        ? cfg.leitura.intervaloMs
        : próximoIntervalo(disponibilidade.falhasConsecutivas, cfg.reconexao),
    aoFalharParcialmente: (falhas) =>
      log.warn(
        { falhas: Object.fromEntries(falhas) },
        'consulta(s) falharam neste ciclo; as demais seguem',
      ),
    aoLer: (leitura) => {
      // O último argumento marca os ciclos em que o ΔE do log NÃO mede ruído de
      // leitura, porque a referência é uma cor declarada (003/FR-009).
      registrarLeitura(
        log,
        leitura,
        parâmetros.regiao,
        estado.corDeReferência,
        referênciaÉDeOverride(
          estado.corDeReferência,
          casarTag(estado.tema, parâmetros.coresPorTag ?? []),
        ),
      );

      // Disponibilidade primeiro: seus eventos vêm antes na ordem do contrato,
      // e é ela que define o ritmo do próximo ciclo.
      const veredito = avaliarDisponibilidade(disponibilidade, leitura);
      disponibilidade = veredito;
      runtime.atualizarDisponibilidade(veredito.disponível, veredito.causa);

      // Toda a decisão sobre cor e contexto acontece aqui dentro, numa função
      // pura. O serviço só guarda o estado que ela devolve e distribui eventos.
      const resultado = aplicarCiclo(estado, leitura, parâmetros);
      estado = resultado.estado;
      runtime.atualizarNúcleo(estado);

      const eventos = [...veredito.eventos, ...resultado.eventos];
      for (const evento of eventos) registrarEvento(log, evento);
      runtime.emitir(eventos);

      // O painel acompanha a operação sem que ninguém recarregue nada
      // (004/FR-007).
      servidorDoPainel?.publicar(painel.estado());
    },
  });

  // Nada aqui pode derrubar o processo: o serviço roda durante o culto, sem
  // ninguém olhando o terminal (FR-014, Princípio IV).
  //
  // Registrados ANTES de montar a saída DMX de propósito: se a montagem lançar,
  // o processo tem que sobreviver. Estavam depois, e a convergência pegou.
  process.on('uncaughtException', (erro) =>
    log.error({ erro: erro.message }, 'exceção não tratada; serviço continua'),
  );
  process.on('unhandledRejection', (motivo) =>
    log.error({ motivo: String(motivo) }, 'promessa rejeitada; serviço continua'),
  );

  // --- Saída DMX (feature 002) --------------------------------------------
  // Opcional: sem o bloco `freestyler` na config, o integrador roda como a 001
  // sozinha — lê, publica eventos e não comanda luz nenhuma.
  let saída: SaídaAtiva | null = cfg.freestyler
    ? ligarSaídaDMX(cfg.freestyler, runtime, log, cfg.reconexao)
    : null;

  // --- Painel (feature 004) ------------------------------------------------

  let servidorDoPainel: Servidor | null = null;

  const bruto = lerArquivoBruto(caminho);
  const vivaInicial: ConfiguraçãoViva = {
    atual: cfg,
    bruto: bruto.ok ? bruto.valor.bruto : {},
    conteúdo: bruto.ok ? bruto.valor.conteúdo : '',
    hash: bruto.ok ? bruto.valor.hash : hashDoConteúdo(''),
    caminho,
  };

  const painel = criarPainel({
    inicial: vivaInicial,
    runtime,
    ambiente: process.env,
    log,
    aplicarEfeitos,
  });

  /**
   * Aplica os efeitos de uma recarga aceita, um a um (004/FR-018).
   *
   * Ponto **único** por onde toda recarga passa. Cada história aplica efeitos
   * diferentes, mas nenhuma pode ter caminho próprio: dois despachos
   * divergiriam, e a FR-019 deixaria de ser verificável num lugar só.
   *
   * Devolve os efeitos recusados. Hoje só `re_servir_painel` recusa.
   */
  async function aplicarEfeitos(
    efeitos: readonly Efeito[],
    nova: Config,
  ): Promise<readonly Efeito[]> {
    const anterior = cfg;
    cfg = nova;
    const recusados: Efeito[] = [];

    for (const efeito of efeitos) {
      switch (efeito) {
        case 'ritmo_de_leitura':
        case 'parametros_de_reconexao':
          // Nada a fazer: `calcularAtraso` lê `cfg` a cada volta, então o valor
          // novo já vale no ciclo seguinte, sem abandonar a leitura em curso.
          break;

        case 'parametros_do_nucleo':
          parâmetros = parâmetrosDe(nova);
          break;

        case 'zerar_estado_de_cor':
          // ⚠️ A leitura seguinte será adotada e anunciada DE IMEDIATO, sem
          // passar pelo limiar de ΔE nem pela confirmação por permanência
          // (004/FR-021a).
          //
          // Isso **não** é exceção à regra anti-flicker da constitution: é o
          // mesmo caminho de `primeira_leitura` que a 001/FR-009a já usa no
          // arranque. O motivo é que `leitura.regiao` troca a PROCEDÊNCIA da
          // cor — a referência guardada veio de outra região da tela, e mantê-la
          // faria o ΔE seguinte comparar duas grandezas diferentes, anunciando
          // mudança que não houve ou engolindo a que houve.
          //
          // Quem ler isto como defeito e "consertar" quebra a FR-021a sem que
          // nenhum teste da 001 ou da 002 reclame.
          estado = {
            ...estado,
            corDeReferência: null,
            candidata: null,
            ciclosDeConfirmação: 0,
            origemDaCor: null,
            tagDaCor: null,
          };
          runtime.atualizarNúcleo(estado);
          break;

        case 'reconectar_holyrics':
          clienteAtual = novoClienteHolyrics(nova);
          log.info(
            { holyrics: `${nova.holyrics.host}:${nova.holyrics.port}` },
            'cliente do Holyrics refeito',
          );
          break;

        case 'reconectar_freestyler':
          if (saída !== null && nova.freestyler) {
            await saída.fechar();
            log.info({}, 'conexão anterior com o Freestyler encerrada');
            saída = ligarSaídaDMX(nova.freestyler, runtime, log, nova.reconexao);
          }
          break;

        case 'reresolver_grupo':
          if (saída !== null && nova.freestyler) await saída.reresolverGrupo(nova.freestyler);
          break;

        case 'parametros_da_saida':
          if (saída !== null && nova.freestyler) {
            await saída.atualizarParâmetros(nova.freestyler);
          }
          break;

        case 'religar_saida':
          if (saída !== null) {
            await saída.fechar();
            saída = null;
            runtime.atualizarSaída({ disponível: false, grupo: null, gruposConhecidos: [] });
            log.info({}, 'saída DMX desligada pela configuração');
          }
          if (nova.freestyler) {
            saída = ligarSaídaDMX(nova.freestyler, runtime, log, nova.reconexao);
          }
          break;

        case 'reconfigurar_log':
          loggerRecarregável.aplicar(nova.log);
          break;

        case 're_servir_painel':
          if (!(await reservirPainel(nova))) recusados.push('re_servir_painel');
          break;

        case 'desconhecido':
          // Registrado pelo próprio painel, com os campos. Aqui não há o que
          // fazer — e é exatamente esse "não há o que fazer" que o efeito
          // nomeia.
          break;
      }
    }

    if (recusados.length > 0) cfg = anterior;
    return recusados;
  }

  /**
   * Serve a página no endereço novo e encerra o antigo (004/FR-018a).
   *
   * Devolve `false` quando o endereço novo não abre — aí a alteração inteira é
   * recusada e o antigo **continua servindo**. Sem isso, um erro de digitação
   * deixaria o operador sem página até o próximo reinício, que é o mesmo
   * desamparo que a FR-004a proíbe na subida.
   */
  async function reservirPainel(nova: Config): Promise<boolean> {
    const antigo = servidorDoPainel;

    // Mudou algo do bloco `painel` que não é o endereço — `habilitado` seguindo
    // verdadeiro, por exemplo. Rebindar aqui tentaria abrir a porta que este
    // mesmo processo já ocupa, daria `EADDRINUSE`, e a submissão seria recusada
    // por um conflito consigo mesma.
    if (
      antigo !== null &&
      nova.painel.habilitado &&
      antigo.host === nova.painel.host &&
      antigo.port === nova.painel.port
    ) {
      return true;
    }

    if (!nova.painel.habilitado) {
      if (antigo !== null) {
        await antigo.fechar();
        servidorDoPainel = null;
        log.info({}, 'painel desligado pela configuração');
      }
      return true;
    }

    const r = await criarServidor({
      host: nova.painel.host,
      port: nova.painel.port,
      fonte: painel,
      aoErro: (erro) => log.warn({ erro: erro.message }, 'erro no servidor do painel'),
    });

    if (!r.ok) {
      log.warn(
        { host: nova.painel.host, port: nova.painel.port, erro: r.erro },
        'endereço novo do painel não pôde ser aberto; o anterior continua servindo',
      );
      return false;
    }

    // O novo já está escutando: só agora o antigo pode cair.
    if (antigo !== null) await antigo.fechar();
    servidorDoPainel = r.valor;
    anunciarPainel(nova, r.valor);
    return true;
  }

  function anunciarPainel(c: Config, s: Servidor): void {
    log.info({ host: s.host, port: s.port }, `painel disponível em http://${s.host}:${s.port}`);

    // FR-003b: sem autenticação, o log é a única coisa que separa "eu abri" de
    // "abriu sozinho e ninguém viu".
    if (!éLaçoLocal(c.painel.host)) {
      log.warn(
        { host: s.host, port: s.port },
        `PAINEL EXPOSTO NA REDE em http://${s.host}:${s.port} — ` +
          'qualquer máquina que alcance esta aqui pode editar a configuração, sem senha',
      );
    }
  }

  function éLaçoLocal(host: string): boolean {
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  }

  // FR-004a: falha ao subir a página vai para o log e NÃO impede o serviço de
  // operar. Luz é a função principal; painel é conveniência.
  if (cfg.painel.habilitado) {
    void criarServidor({
      host: cfg.painel.host,
      port: cfg.painel.port,
      fonte: painel,
      aoErro: (erro) => log.warn({ erro: erro.message }, 'erro no servidor do painel'),
    }).then((r) => {
      if (r.ok) {
        servidorDoPainel = r.valor;
        anunciarPainel(cfg, r.valor);
      } else {
        log.warn(
          { host: cfg.painel.host, port: cfg.painel.port, erro: r.erro },
          'painel não pôde subir; o serviço segue operando sem ele',
        );
      }
    });
  } else {
    log.info({}, 'painel desligado por configuração');
  }

  const encerrar = (sinal: string) => {
    log.info({ sinal }, 'encerrando');
    // Encerrar é parar de comandar, não deixar um estado final (FR-028).
    // Nenhuma cor é enviada aqui de propósito.
    void Promise.resolve(servidorDoPainel?.fechar())
      .catch(() => undefined)
      .then(() => saída?.fechar())
      .catch(() => undefined)
      .then(() => poller.parar())
      .then(() => process.exit(0));
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));

  poller.iniciar();
  log.info('ciclo de leitura iniciado');
}

main();
