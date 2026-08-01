/**
 * Servidor HTTP do painel (004/FR-001, FR-004a, FR-018a).
 *
 * Contrato: `specs/004-painel-de-configuracao/contracts/painel-http.md`.
 *
 * `node:http` cru, sem framework. São cinco rotas, todas sem parâmetro de
 * caminho, sem middleware e sem negociação de conteúdo — um `switch` cabe aqui e
 * não tem comportamento escondido (Princípio V).
 *
 * Adaptador fino: traduz HTTP para chamadas do serviço e de volta. **Nenhuma
 * decisão mora aqui** — validar, mesclar, gravar e despachar efeitos é
 * `src/service/painel.ts`.
 *
 * **Sem autenticação, por decisão registrada** (FR-003, e o risco nomeado em
 * `spec.md § Riscos aceitos`). Escuta em `127.0.0.1` por padrão (FR-003a).
 *
 * **Nenhuma rota comanda luz.** Não há caminho daqui até o Freestyler — é o que
 * preserva a garantia da 002 de que nenhuma fixture fora do grupo seguidor
 * recebe comando.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { PÁGINA } from './pagina.ts';

/** O que o serviço precisa oferecer para o servidor ter o que responder. */
export interface FonteDoPainel {
  /** Retrato completo: estado observável + configuração + divergência. */
  estado(): unknown;
  /** Só a parte de configuração, com o hash a devolver na submissão. */
  configuração(): unknown;
  /** Processa `PUT /api/config`. Devolve o status e o corpo já decididos. */
  submeter(corpo: unknown): Promise<RespostaDeSubmissão>;
}

export interface RespostaDeSubmissão {
  readonly status: 200 | 409 | 422 | 500;
  readonly corpo: unknown;
}

export interface Servidor {
  readonly host: string;
  readonly port: number;
  /** Empurra um retrato para todas as abas abertas (FR-007). */
  publicar(estado: unknown): void;
  /** Encerra o servidor e todas as conexões SSE. */
  fechar(): Promise<void>;
}

export interface OpçõesDoServidor {
  readonly host: string;
  readonly port: number;
  readonly fonte: FonteDoPainel;
  readonly aoErro?: (erro: Error) => void;
}

export type ResultadoDoServidor =
  | { readonly ok: true; readonly valor: Servidor }
  | { readonly ok: false; readonly erro: string };

/**
 * Teto do corpo de uma submissão.
 *
 * A configuração inteira tem poucos kilobytes; 256 KB é folga larga. Sem teto,
 * um corpo infinito derrubaria o processo por memória — e o Princípio IV passa a
 * valer contra entrada de fora a partir desta feature.
 */
const TETO_DO_CORPO = 256 * 1024;

/** Intervalo do comentário que prova que o canal SSE está vivo. */
const KEEPALIVE_MS = 20_000;

export function criarServidor(opções: OpçõesDoServidor): Promise<ResultadoDoServidor> {
  const { host, port, fonte, aoErro } = opções;
  const assinantes = new Set<ServerResponse>();

  const servidor = createServer((req, res) => {
    // Nada que entre por aqui pode derrubar o processo (Princípio IV).
    tratar(req, res).catch((erro: unknown) => {
      aoErro?.(erro as Error);
      responderJSON(res, 500, { erro: 'interno' });
    });
  });

  async function tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Sem parâmetros de consulta em nenhuma rota: o caminho é tudo que importa.
    const caminho = (req.url ?? '/').split('?')[0] ?? '/';
    const método = req.method ?? 'GET';

    if (método === 'GET' && caminho === '/') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(PÁGINA);
      return;
    }

    if (método === 'GET' && caminho === '/api/estado') {
      responderJSON(res, 200, fonte.estado());
      return;
    }

    if (método === 'GET' && caminho === '/api/eventos') {
      abrirSSE(res);
      return;
    }

    if (método === 'GET' && caminho === '/api/config') {
      responderJSON(res, 200, fonte.configuração());
      return;
    }

    if (método === 'PUT' && caminho === '/api/config') {
      const corpo = await lerCorpo(req);
      if (!corpo.ok) {
        responderJSON(res, 422, { erro: 'invalida', detalhe: corpo.erro });
        return;
      }
      const r = await fonte.submeter(corpo.valor);
      responderJSON(res, r.status, r.corpo);
      return;
    }

    // Método errado numa rota que existe é 405, não 404: a diferença diz ao
    // desenvolvedor se o caminho está errado ou o verbo.
    if (caminho === '/api/config' || caminho === '/api/estado' || caminho === '/api/eventos') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('método não permitido nesta rota\n');
      return;
    }

    // Sem servir arquivo do disco e sem listagem de diretório. A página não
    // resolve caminho nenhum em tempo de execução, então não há travessia
    // possível — é propriedade da decisão de embutir o HTML, não sorte.
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('não encontrado\n');
  }

  function abrirSSE(res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    // Primeiro retrato imediato: sem ele a tela ficaria vazia até o próximo
    // ciclo de leitura.
    escrever(res, fonte.estado());
    assinantes.add(res);
    res.on('close', () => assinantes.delete(res));
  }

  function escrever(res: ServerResponse, estado: unknown): void {
    try {
      res.write(`event: estado\ndata: ${JSON.stringify(estado)}\n\n`);
    } catch {
      // Aba fechada no meio da escrita. O `close` remove o assinante; aqui só
      // não pode escapar exceção.
      assinantes.delete(res);
    }
  }

  const relógio = setInterval(() => {
    for (const res of assinantes) {
      try {
        res.write(':keepalive\n\n');
      } catch {
        assinantes.delete(res);
      }
    }
  }, KEEPALIVE_MS);
  relógio.unref?.();

  return new Promise<ResultadoDoServidor>((resolve) => {
    // Erro na SUBIDA (porta ocupada, endereço inválido) vira recusa, não
    // exceção: quem chama decide, e a FR-004a manda o serviço seguir sem a
    // página.
    const aoFalharNaSubida = (erro: NodeJS.ErrnoException): void => {
      clearInterval(relógio);
      resolve({ ok: false, erro: `${erro.code ?? 'erro'}: ${erro.message}` });
    };
    servidor.once('error', aoFalharNaSubida);

    servidor.listen(port, host, () => {
      servidor.off('error', aoFalharNaSubida);
      // Depois de escutando, erro de socket é registro, não recusa.
      servidor.on('error', (erro) => aoErro?.(erro));

      resolve({
        ok: true,
        valor: {
          host,
          port,
          publicar(estado) {
            for (const res of assinantes) escrever(res, estado);
          },
          fechar() {
            clearInterval(relógio);
            // As conexões SSE ficam abertas por natureza: sem encerrá-las, o
            // `close` do servidor esperaria para sempre.
            for (const res of assinantes) {
              try {
                res.end();
              } catch {
                // Já morta. Fechar é o objetivo, e ele foi atingido.
              }
            }
            assinantes.clear();
            return fecharServidor(servidor);
          },
        },
      });
    });
  });
}

function fecharServidor(servidor: Server): Promise<void> {
  return new Promise((resolve) => {
    servidor.close(() => resolve());
    // Conexões keep-alive ociosas seguram o `close`. Encerrá-las é o que faz o
    // desligamento ser imediato em vez de depender do teto do navegador.
    servidor.closeIdleConnections?.();
  });
}

function responderJSON(res: ServerResponse, status: number, corpo: unknown): void {
  if (res.headersSent) return;
  const texto = JSON.stringify(corpo ?? null);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(texto);
}

type CorpoLido =
  | { readonly ok: true; readonly valor: unknown }
  | { readonly ok: false; readonly erro: string };

/**
 * Lê o corpo com teto, e trata as três formas de entrada malformada que a
 * FR-012 e o Princípio IV cobrem: não-JSON, grande demais, e conexão cortada.
 *
 * A mensagem nunca ecoa o conteúdo recebido (FR-016).
 */
function lerCorpo(req: IncomingMessage): Promise<CorpoLido> {
  return new Promise((resolve) => {
    let bytes = 0;
    const partes: Buffer[] = [];

    req.on('data', (parte: Buffer) => {
      bytes += parte.length;
      if (bytes > TETO_DO_CORPO) {
        resolve({ ok: false, erro: 'corpo grande demais' });
        req.destroy();
        return;
      }
      partes.push(parte);
    });

    req.on('end', () => {
      try {
        const texto = Buffer.concat(partes).toString('utf8');
        resolve({ ok: true, valor: JSON.parse(texto) });
      } catch {
        resolve({ ok: false, erro: 'corpo não é JSON válido' });
      }
    });

    req.on('error', () => resolve({ ok: false, erro: 'conexão interrompida' }));
  });
}
