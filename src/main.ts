/**
 * Ponto de entrada do integrador.
 *
 * Carrega configuração, monta o serviço e inicia o ciclo de leitura. A única
 * condição que impede a partida é configuração inválida (FR-020) — Holyrics
 * fechado não impede nada, o serviço sobe e fica tentando (FR-014).
 */

import { ErroDeConfiguração, carregarConfig } from './adapters/config.ts';
import {
  criarLogger,
  registrarEvento,
  registrarLeitura,
} from './adapters/logger.ts';
import { criarCliente } from './adapters/holyrics/client.ts';
import { casarTag, referênciaÉDeOverride } from './core/override.ts';
import {
  ESTADO_INICIAL,
  aplicarCiclo,
  type EstadoDoServiço,
  type ParâmetrosDoNúcleo,
} from './core/state.ts';
import { próximoIntervalo } from './core/backoff.ts';
import {
  DISPONIBILIDADE_INICIAL,
  avaliarDisponibilidade,
  type EstadoDeDisponibilidade,
} from './service/availability.ts';
import { criarPoller } from './service/poller.ts';
import { criarRuntime, type Runtime } from './service/runtime.ts';
import { criarCliente as criarClienteFreestyler } from './adapters/freestyler/client.ts';
import { criarSaídaDMX } from './service/saida-dmx.ts';
import {
  DISPONIBILIDADE_INICIAL as BATIMENTO_INICIAL,
  avaliarPulso,
  registrarPulso,
} from './core/heartbeat.ts';
import type { Config } from './adapters/config.ts';
import type { Logger } from 'pino';

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ConfigFreestyler = NonNullable<Config['freestyler']>;

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
): { fechar: () => Promise<void> } {
  let batimento = BATIMENTO_INICIAL;
  let falhasConsecutivas = 0;
  let encerrando = false;
  let relógioDeAvaliação: NodeJS.Timeout | null = null;

  const clienteFs = criarClienteFreestyler({
    host: cfg.host,
    port: cfg.port,
    // Sem prazo, uma consulta sem resposta pararia a luz por tempo
    // indeterminado: ler o status dos grupos é pré-condição de toda aplicação
    // de cor e os envios são serializados (FR-023a).
    timeoutDeConsultaMs: cfg.consultaTimeoutMs,
    aoPulso: () => {
      batimento = registrarPulso(batimento, Date.now());
    },
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
  }

  // A mesa pode travar com o socket aberto — os `write` seguiriam "funcionando"
  // para o vazio. O pulso é o único sinal que denuncia isso (FR-021a).
  relógioDeAvaliação = setInterval(() => {
    const veredito = avaliarPulso(batimento, Date.now(), cfg.heartbeatTimeoutMs);
    const anterior = batimento.disponível;
    batimento = veredito.estado;

    if (veredito.evento === 'freestyler_perdido') {
      log.warn({ host: cfg.host, port: cfg.port }, 'Freestyler não responde (sem batimento)');
      if (anterior || clienteFs.conectado()) {
        clienteFs.fechar();
        void conectar();
      }
    } else if (veredito.evento === 'freestyler_recuperado') {
      log.info({}, 'Freestyler está batendo');
    }

    // Reenvia o que ficou pendente mesmo sem evento novo: um comando pode ter
    // se perdido com o socket vivo (FR-029a).
    if (batimento.disponível) void saída.reprocessar();
  }, 2000);
  relógioDeAvaliação.unref?.();

  void conectar();

  const cancelar = runtime.subscribe((evento) => {
    void saída.aoEvento(evento);
  });

  log.info({ grupo: cfg.grupo, host: cfg.host, port: cfg.port }, 'saída DMX ativa');

  return {
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

  const log = criarLogger({ log: config.log, token });

  log.info(
    {
      caminho,
      holyrics: `${config.holyrics.host}:${config.holyrics.port}`,
      intervaloMs: config.leitura.intervaloMs,
      regiao: config.leitura.regiao,
      limiarDeltaE: config.cor.limiarDeltaE,
      ciclosDeConfirmacao: config.cor.ciclosDeConfirmacao,
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

  const parâmetros: ParâmetrosDoNúcleo = {
    regiao: config.leitura.regiao,
    limiarDeltaE: config.cor.limiarDeltaE,
    ciclosDeConfirmacao: config.cor.ciclosDeConfirmacao,
    // Ausente na configuração vira lista vazia: nenhum caminho novo é
    // exercitado e o comportamento é o de antes da feature 003 (003/FR-002).
    coresPorTag: config.coresPorTag ?? [],
  };

  // Na subida, para que um mapeamento esquecido no arquivo não vire fantasma:
  // a cor não obedece o telão e nada explica por quê (003/FR-016).
  if (config.coresPorTag !== undefined && config.coresPorTag.length > 0) {
    log.info(
      {
        mapeamentos: config.coresPorTag.length,
        tags: config.coresPorTag.map((m) => m.tag),
      },
      `override de cor por tag ativo: ${config.coresPorTag.length} mapeamento(s)`,
    );
  }

  let estado: EstadoDoServiço = ESTADO_INICIAL;
  let disponibilidade: EstadoDeDisponibilidade = DISPONIBILIDADE_INICIAL;

  const cliente = criarCliente({
    host: config.holyrics.host,
    port: config.holyrics.port,
    requestTimeoutMs: config.holyrics.requestTimeoutMs,
    token,
  });

  const poller = criarPoller({
    cliente,
    agora: () => Date.now(),
    dormir,
    // Com o Holyrics atendendo, o ritmo é o intervalo configurado. Com ele
    // fora do ar, o backoff espaça as tentativas até o teto — que é menor que
    // o prazo do SC-005, para a retomada continuar dentro do prometido.
    calcularAtraso: () =>
      disponibilidade.falhasConsecutivas === 0
        ? config.leitura.intervaloMs
        : próximoIntervalo(disponibilidade.falhasConsecutivas, config.reconexao),
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
      runtime.atualizarDisponibilidade(veredito.disponível);

      // Toda a decisão sobre cor e contexto acontece aqui dentro, numa função
      // pura. O serviço só guarda o estado que ela devolve e distribui eventos.
      const resultado = aplicarCiclo(estado, leitura, parâmetros);
      estado = resultado.estado;
      runtime.atualizarNúcleo(estado);

      const eventos = [...veredito.eventos, ...resultado.eventos];
      for (const evento of eventos) registrarEvento(log, evento);
      runtime.emitir(eventos);
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
  const saída = config.freestyler
    ? ligarSaídaDMX(config.freestyler, runtime, log, config.reconexao)
    : null;

  const encerrar = (sinal: string) => {
    log.info({ sinal }, 'encerrando');
    // Encerrar é parar de comandar, não deixar um estado final (FR-028).
    // Nenhuma cor é enviada aqui de propósito.
    void Promise.resolve(saída?.fechar())
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
