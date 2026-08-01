/**
 * Log do serviço: arquivo rotacionado + terminal, com redação de credencial.
 *
 * Requisitos: FR-013d a FR-013i, FR-019, SC-007, SC-009.
 *
 * Falha ao gravar em arquivo NÃO derruba o serviço (FR-013i): o log cai para
 * somente-terminal e a vida segue. Durante um culto, ficar sem log é degradação;
 * morrer não é opção.
 */

import pino from 'pino';
import type { Config } from './config.ts';
import { deltaE } from '../core/color.ts';
import type { Evento } from '../core/events.ts';
import type { Casamento } from '../core/override.ts';
import type { Cor, LeituraDoCiclo } from '../core/state.ts';

export type Logger = pino.Logger;

/** Hexadecimal só para leitura humana do log; a decisão usa os componentes. */
function hex(cor: Cor): string {
  const dois = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${dois(cor.r)}${dois(cor.g)}${dois(cor.b)}`;
}

function descreverCor(cor: Cor) {
  return { hex: hex(cor), r: cor.r, g: cor.g, b: cor.b };
}

/**
 * Registra o veredito do tema contra o mapeamento de tags (feature 003).
 *
 * Só dois dos cinco casos viram linha, e a escolha é deliberada:
 *
 * - `nenhuma_mapeada` é o sintoma de tag digitada diferente nos dois lados, que
 *   sem esta linha tem exatamente o mesmo sintoma de override nenhum — a cor
 *   simplesmente não obedece (FR-017, SC-005).
 * - `mapeada` **com preteridas** é o empate, e o operador precisa saber qual
 *   venceu para mover a linha certa no arquivo (FR-007b).
 *
 * `sem_tags`, `sem_tema` e `sem_mapeamento` **não** viram linha: são o estado
 * normal de quem não usa a feature, e registrá-los encheria de ruído o log de
 * todo culto.
 */
function registrarCasamento(log: Logger, casamento: Casamento): void {
  if (casamento.tipo === 'nenhuma_mapeada') {
    log.info(
      { tagsObservadas: casamento.tags },
      `tema traz tags, nenhuma mapeada: ${casamento.tags.join(', ')}`,
    );
    return;
  }

  if (casamento.tipo === 'mapeada' && casamento.preteridas.length > 0) {
    log.info(
      { tagVencedora: casamento.tag, preteridas: casamento.preteridas },
      `mais de uma tag mapeada; venceu "${casamento.tag}" por vir antes na configuração`,
    );
  }
}

/**
 * Registra um evento no nível `info`.
 *
 * É este o log que o operador lê depois do culto: contém os eventos, não uma
 * linha por leitura (FR-013h). O horário vem do próprio pino.
 */
export function registrarEvento(log: Logger, evento: Evento): void {
  switch (evento.tipo) {
    case 'cor_anunciada': {
      // Com duas fontes de cor, a linha precisa dizer de qual delas veio — senão
      // um override esquecido no arquivo vira fantasma: a cor não obedece o
      // telão e nada explica por quê (FR-015).
      const porTag = evento.origem === 'mapeada';
      log.info(
        {
          evento: evento.tipo,
          cor: descreverCor(evento.cor),
          anterior: evento.anterior ? descreverCor(evento.anterior) : null,
          motivo: evento.motivo,
          deltaE: evento.deltaE === null ? null : Number(evento.deltaE.toFixed(2)),
          origem: evento.origem,
          tag: evento.tag,
          // Preservada mesmo sob override, para o operador julgar depois se
          // ainda precisa dele (FR-009). Nula quando a extração falhou e a cor
          // declarada cobriu (FR-008a) — o que é diferente de ela ter
          // coincidido com a declarada.
          extraída: evento.extraída ? descreverCor(evento.extraída) : null,
        },
        porTag
          ? `cor anunciada: ${hex(evento.cor)} — da tag "${evento.tag ?? ''}"`
          : `cor anunciada: ${hex(evento.cor)}`,
      );
      return;
    }

    case 'item_trocado':
      log.info(
        {
          evento: evento.tipo,
          de: { id: evento.anterior.id, nome: evento.anterior.nome },
          para: { id: evento.atual.id, nome: evento.atual.nome },
        },
        `item trocado: ${evento.anterior.nome || evento.anterior.id} → ${evento.atual.nome || evento.atual.id}`,
      );
      return;

    case 'slide_mudou':
      log.info(
        {
          evento: evento.tipo,
          de: evento.de,
          para: evento.para,
          total: evento.total,
          item: evento.item.nome || evento.item.id,
        },
        `slide ${evento.de} → ${evento.para}${evento.total === null ? '' : ` de ${evento.total}`}`,
      );
      return;

    case 'apresentacao_iniciada':
      log.info(
        { evento: evento.tipo, item: { id: evento.item.id, nome: evento.item.nome } },
        `apresentação iniciada: ${evento.item.nome || evento.item.id}`,
      );
      return;

    case 'apresentacao_encerrada':
      log.info(
        { evento: evento.tipo, anterior: { id: evento.anterior.id, nome: evento.anterior.nome } },
        'apresentação encerrada',
      );
      return;

    case 'tema_trocado':
      log.info(
        {
          evento: evento.tipo,
          // As tags decidem cor apenas quando declaradas na configuração
          // (feature 003, emenda ao FR-005b). Sem mapeamento, seguem sendo só
          // observação.
          de: evento.anterior ? { id: evento.anterior.id, nome: evento.anterior.nome, tags: evento.anterior.tags } : null,
          para: evento.atual ? { id: evento.atual.id, nome: evento.atual.nome, tags: evento.atual.tags } : null,
        },
        `tema trocado: ${evento.atual?.nome ?? '(nenhum)'}`,
      );
      registrarCasamento(log, evento.casamento);
      return;

    case 'holyrics_perdido':
      log.warn(
        { evento: evento.tipo, causa: evento.causa },
        evento.causa === 'credencial_recusada'
          ? 'Holyrics recusou a credencial — verifique HOLYRICS_TOKEN'
          : 'Holyrics indisponível — tentando reconectar',
      );
      return;

    case 'holyrics_recuperado':
      log.info({ evento: evento.tipo }, 'Holyrics está respondendo');
      return;
  }
}

/**
 * Registra a leitura crua no nível `debug`.
 *
 * As 8 regiões e o ΔE só aparecem aqui — é este o insumo dos cenários 4 e 5 do
 * quickstart, onde região e limiar são calibrados. Em `info`, nada disso polui
 * o log (FR-013h).
 */
export function registrarLeitura(
  log: Logger,
  leitura: LeituraDoCiclo,
  regiaoEscolhida: number,
  referência: Cor | null,
  /** Verdadeiro quando a referência é uma cor declarada, não extraída. */
  referênciaDeOverride = false,
): void {
  if (!log.isLevelEnabled('debug')) return;

  // ΔE da região escolhida contra a referência atual. É este número que a
  // calibração do limiar observa: quanto ele oscila com o telão parado.
  //
  // ⚠️ **Só vale isso quando a referência veio da extração.** Com override
  // ativo a referência é a cor declarada pelo operador, e o número passa a medir
  // a distância entre a extração e uma cor escolhida à mão — que não diz nada
  // sobre ruído de leitura. `referênciaDeOverride` marca esses ciclos para que
  // ninguém calibre o limiar em cima deles.
  const escolhida = leitura.cor.ok
    ? leitura.cor.valor.regioes[regiaoEscolhida]
    : undefined;
  const diferença =
    escolhida !== undefined && referência !== null
      ? Number(deltaE(referência, escolhida).toFixed(2))
      : null;

  log.debug(
    {
      deltaE: diferença,
      referênciaDeOverride,
      // Com override, o ΔE acima não mede ruído. A cor extraída de cada leitura
      // continua em `regioes` (marcada com `escolhida`), e é comparando ELA
      // entre ciclos que se confirma que a extração não mudou.
      deltaEMedeRuído: !referênciaDeOverride,
      regioes: leitura.cor.ok
        ? leitura.cor.valor.regioes.map((c, i) => ({
            i,
            ...descreverCor(c),
            escolhida: i === regiaoEscolhida,
          }))
        : null,
      falhaDeCor: leitura.cor.ok ? null : leitura.cor.motivo,
      item: leitura.item.ok
        ? (leitura.item.valor && {
            id: leitura.item.valor.id,
            slide: leitura.item.valor.slide,
          }) ?? null
        : `falhou: ${leitura.item.motivo}`,
      tema: leitura.tema.ok ? (leitura.tema.valor?.nome ?? null) : `falhou: ${leitura.tema.motivo}`,
    },
    'leitura',
  );
}

/**
 * Substitui, em profundidade, qualquer string que contenha o token.
 *
 * Segunda barreira: a primeira é nunca passar o token para o log. Esta existe
 * para o caso de uma URL montada com `?token=` escapar por descuido (SC-007).
 */
function criarScrub(token: string) {
  const suficientementeLongo = token.length >= 4;

  return function scrub(valor: unknown): unknown {
    if (typeof valor === 'string') {
      return suficientementeLongo && valor.includes(token)
        ? valor.replaceAll(token, '[REDACTED]')
        : valor;
    }
    if (Array.isArray(valor)) return valor.map(scrub);
    if (valor !== null && typeof valor === 'object') {
      const saída: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(valor)) saída[k] = scrub(v);
      return saída;
    }
    return valor;
  };
}

export interface OpçõesDeLogger {
  readonly log: Config['log'];
  readonly token: string;
  /** Chamado quando a gravação em arquivo falha. Só para diagnóstico. */
  readonly aoFalharArquivo?: (erro: Error) => void;
}

/**
 * Monta o logger.
 *
 * Dois destinos, ambos no nível configurado: o arquivo (rotacionado por tamanho,
 * com limite de arquivos mantidos) e o terminal. O nível `debug` é o que liga o
 * registro por leitura — em `info`, o log contém eventos e não uma linha por
 * segundo (FR-013h).
 */
export function criarLogger(opções: OpçõesDeLogger): Logger {
  const { log, token, aoFalharArquivo } = opções;
  const scrub = criarScrub(token);

  const opçõesBase: pino.LoggerOptions = {
    level: log.nivel,
    // Redação por nome de campo — complementa o scrub por valor.
    redact: {
      paths: ['token', '*.token', 'query', '*.query', 'headers.token'],
      censor: '[REDACTED]',
    },
    formatters: {
      log: (objeto) => scrub(objeto) as Record<string, unknown>,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const destinoTerminal: pino.TransportTargetOptions = {
    target: 'pino/file',
    options: { destination: 1 },
    level: log.nivel,
  };

  const destinoArquivo: pino.TransportTargetOptions = {
    target: 'pino-roll',
    options: {
      file: log.arquivo,
      size: `${log.tamanhoMaximoMb}m`,
      limit: { count: log.arquivosMantidos },
      mkdir: true,
    },
    level: log.nivel,
  };

  try {
    const transporte = pino.transport({
      targets: [destinoTerminal, destinoArquivo],
    });

    // O transporte roda em worker: uma falha de escrita chega como evento, não
    // como exceção. Sem este handler, viraria 'unhandled error' e mataria o
    // processo — exatamente o que a FR-013i proíbe.
    transporte.on('error', (erro: Error) => {
      aoFalharArquivo?.(erro);
      process.stderr.write(
        `[logger] falha ao gravar log em arquivo, seguindo só no terminal: ${erro.message}\n`,
      );
    });

    return pino(opçõesBase, transporte);
  } catch (erro) {
    // Falha na própria criação do transporte (caminho inválido, permissão).
    aoFalharArquivo?.(erro as Error);
    process.stderr.write(
      `[logger] não foi possível abrir o arquivo de log (${log.arquivo}), ` +
        `seguindo só no terminal: ${(erro as Error).message}\n`,
    );
    return pino(opçõesBase);
  }
}

/**
 * Logger cujo `pino` interno pode ser substituído sem que os portadores da
 * referência saibam (004/FR-018).
 *
 * **Por que a indireção existe.** A SC-002 não abre exceção: nenhum campo da
 * configuração pode exigir reinício, e `log.arquivo` é campo. Trocar o destino
 * exige um transporte novo — mas todos os componentes já capturaram a referência
 * do logger na subida. Mutar só `log.level`, que o `pino` aceita nativamente,
 * resolveria metade: a página confirmaria a troca de arquivo e os registros
 * continuariam indo para o antigo.
 *
 * A alternativa era excetuar o destino de log da recarga a quente, contra a
 * SC-002 e a FR-010. Está registrada em `plan.md § Complexity Tracking`.
 *
 * ⚠️ **SUPOSIÇÃO DE PLATAFORMA NÃO VERIFICADA (Princípio I).** O transporte do
 * `pino` roda em worker. O que acontece com o worker antigo quando ele é
 * descartado **durante** uma escrita concorrente não foi observado — a troca
 * pode perder as últimas linhas em trânsito, ou não. Verificação pendente:
 * cenário 31 de `specs/004-painel-de-configuracao/quickstart.md`; detalhes em
 * `research.md` §8. Enquanto isso, a troca é feita na ordem menos arriscada
 * possível: o logger novo é montado ANTES de o antigo ser abandonado.
 */
export interface LoggerRecarregável {
  /** A referência estável, distribuída na subida e nunca substituída. */
  readonly log: Logger;
  /** Troca o `pino` interno. Os registros seguintes obedecem ao novo. */
  aplicar(novoLog: Config['log']): void;
}

export function criarLoggerRecarregável(
  opções: OpçõesDeLogger,
): LoggerRecarregável {
  let atual = criarLogger(opções);

  // Delega tudo ao `pino` corrente. `Reflect.get` com o receiver certo preserva
  // o `this` dos métodos do pino — sem isso, `log.info` perderia o contexto.
  const estável = new Proxy({} as Logger, {
    get: (_alvo, prop) => {
      const valor = Reflect.get(atual, prop, atual) as unknown;
      return typeof valor === 'function' ? valor.bind(atual) : valor;
    },
    set: (_alvo, prop, valor) => Reflect.set(atual, prop, valor, atual),
    has: (_alvo, prop) => prop in atual,
  });

  return {
    log: estável,
    aplicar(novoLog) {
      // Monta o novo ANTES de largar o antigo: se a criação falhar, o que já
      // funcionava continua funcionando (Princípio IV).
      const substituto = criarLogger({ ...opções, log: novoLog });
      atual = substituto;
    },
  };
}
