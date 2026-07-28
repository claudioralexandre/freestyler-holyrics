/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ ⚠️  CONTRATO NÃO VERIFICADO                                                │
 * │                                                                           │
 * │ Transporte, autenticação e classificação de erro aqui vieram da           │
 * │ DOCUMENTAÇÃO pública do Holyrics API Server, não de uso contra a          │
 * │ ferramenta em execução.                                                   │
 * │                                                                           │
 * │ O Princípio I da constitution permite construir sobre contrato presumido  │
 * │ apenas enquanto a suposição estiver marcada — é o que este bloco faz.     │
 * │                                                                           │
 * │ Fonte:  specs/001-leitura-cor-holyrics/contracts/holyrics-api.md          │
 * │ Remover este aviso somente após executar a tarefa T064 (verificação).     │
 * │                                                                           │
 * │ Ainda NÃO observado:                                                      │
 * │   - se o Holyrics aceita corpo vazio nas actions sem parâmetro            │
 * │   - qual código HTTP acompanha token recusado (200 + envelope? 401/403?)  │
 * │   - a string exata devolvida quando o token é inválido                    │
 * │   - se `type: "presentation"` reflete a tela pública ou a de preview      │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

import type {
  ItemEmExibição,
  LeituraDeCor,
  Resultado,
  Tema,
} from '../../core/state.ts';
import { lerApresentação, lerColorMap, lerTema } from './schema.ts';

export interface OpçõesDoCliente {
  readonly host: string;
  readonly port: number;
  readonly requestTimeoutMs: number;
  readonly token: string;
}

export interface ClienteHolyrics {
  lerCor(): Promise<Resultado<LeituraDeCor>>;
  lerApresentação(): Promise<Resultado<ItemEmExibição | null>>;
  lerTema(): Promise<Resultado<Tema | null>>;
}

type Action = 'GetColorMap' | 'GetCurrentPresentation' | 'GetCurrentTheme';

export function criarCliente(opções: OpçõesDoCliente): ClienteHolyrics {
  const { host, port, requestTimeoutMs, token } = opções;

  /**
   * Executa uma action e devolve o corpo bruto.
   *
   * O token vai na query string — aceitável porque a comunicação é `localhost`
   * e não atravessa rede. Ele nunca entra em mensagem de erro (SC-007): as
   * falhas abaixo mencionam apenas a action.
   */
  async function chamar(
    action: Action,
    corpo: Record<string, unknown>,
  ): Promise<Resultado<unknown>> {
    const url = `http://${host}:${port}/api/${action}?token=${encodeURIComponent(token)}`;

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (erro) {
      // Conexão recusada, host inalcançável ou tempo limite estourado: para o
      // integrador é tudo a mesma coisa — o Holyrics não está atendendo.
      const nome = (erro as Error).name;
      const detalhe =
        nome === 'TimeoutError' || nome === 'AbortError'
          ? `tempo limite de ${requestTimeoutMs}ms estourado em ${action}`
          : `sem resposta do Holyrics em ${action}`;
      return { ok: false, motivo: 'indisponivel', detalhe };
    }

    if (resposta.status === 401 || resposta.status === 403) {
      return { ok: false, motivo: 'credencial_recusada' };
    }

    if (!resposta.ok) {
      return {
        ok: false,
        motivo: 'resposta_invalida',
        detalhe: `${action} devolveu HTTP ${resposta.status}`,
      };
    }

    try {
      return { ok: true, valor: await resposta.json() };
    } catch {
      return {
        ok: false,
        motivo: 'resposta_invalida',
        detalhe: `${action} devolveu corpo que não é JSON`,
      };
    }
  }

  return {
    async lerCor() {
      const r = await chamar('GetColorMap', { type: 'presentation' });
      return r.ok ? lerColorMap(r.valor) : r;
    },

    async lerApresentação() {
      const r = await chamar('GetCurrentPresentation', {});
      return r.ok ? lerApresentação(r.valor) : r;
    },

    async lerTema() {
      const r = await chamar('GetCurrentTheme', {});
      return r.ok ? lerTema(r.valor) : r;
    },
  };
}
