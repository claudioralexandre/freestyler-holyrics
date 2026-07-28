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
import { criarRuntime } from './service/runtime.ts';

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  };

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
      registrarLeitura(log, leitura, parâmetros.regiao, estado.corDeReferência);

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

  const encerrar = (sinal: string) => {
    log.info({ sinal }, 'encerrando');
    void poller.parar().then(() => process.exit(0));
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));

  // Nada aqui pode derrubar o processo: o serviço roda durante o culto, sem
  // ninguém olhando o terminal (FR-014, Princípio IV).
  process.on('uncaughtException', (erro) =>
    log.error({ erro: erro.message }, 'exceção não tratada; serviço continua'),
  );
  process.on('unhandledRejection', (motivo) =>
    log.error({ motivo: String(motivo) }, 'promessa rejeitada; serviço continua'),
  );

  poller.iniciar();
  log.info('ciclo de leitura iniciado');
}

main();
