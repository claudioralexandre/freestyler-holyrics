/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ ✅ CONTRATO VERIFICADO EM PARTE — Holyrics 2.29.1, 2026-07-28              │
 * │                                                                           │
 * │ As formas validadas aqui foram confirmadas contra a ferramenta real. A    │
 * │ verificação achou duas divergências, ambas corrigidas abaixo:             │
 * │   - o campo do vermelho chama-se `reg`, não `red`                         │
 * │   - sem apresentação, o color map devolve `data: null`, não array         │
 * │                                                                           │
 * │ Fonte:  specs/001-leitura-cor-holyrics/contracts/holyrics-api.md          │
 * │                                                                           │
 * │ Ainda NÃO observado — não afeta a validação, mas segue em aberto:         │
 * │   - se `slide_number` começa em 0 ou em 1 (só se viu o slide 2 de 3)      │
 * │   - o que vem em item sem noção de slide (imagem, vídeo)                  │
 * │   - se `type: "presentation"` reflete a tela pública ou a de preview      │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

import { z } from 'zod';
import type {
  Cor,
  ItemEmExibição,
  LeituraDeCor,
  Resultado,
  Tema,
} from '../../core/state.ts';

/** Envelope comum a todas as actions. */
const envelope = z.union([
  z.object({ status: z.literal('ok'), data: z.unknown() }),
  z.object({ status: z.literal('error'), error: z.unknown() }),
]);

/**
 * Uma posição do color map.
 *
 * VERIFICADO no Holyrics 2.29.1 (2026-07-28): o campo do vermelho chama-se
 * `reg`, não `red` como a documentação promete — aparente erro de digitação que
 * a ferramenta já enviou para produção. Aceitamos os dois nomes de propósito: se
 * uma versão futura corrigir `reg` para `red`, a leitura continua funcionando.
 * Exigir só um deles foi justamente o defeito que a verificação encontrou, e o
 * sintoma era invisível — "a cor nunca muda", não um erro.
 */
const corBruta = z
  .object({
    reg: z.int().min(0).max(255).optional(),
    red: z.int().min(0).max(255).optional(),
    green: z.int().min(0).max(255),
    blue: z.int().min(0).max(255),
  })
  .refine((c) => c.reg !== undefined || c.red !== undefined, {
    message: 'sem campo de vermelho: nem `reg` nem `red`',
  })
  .transform((c) => ({ r: (c.reg ?? c.red) as number, g: c.green, b: c.blue }));

const itemBruto = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  type: z.string().optional(),
  name: z.string().optional(),
  slide_number: z.int().optional(),
  total_slides: z.int().optional(),
});

const temaBruto = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

function falha<T>(motivo: 'resposta_invalida', detalhe: string): Resultado<T> {
  return { ok: false, motivo, detalhe };
}

/**
 * Extrai `data` do envelope, ou classifica o erro.
 *
 * VERIFICADO no Holyrics 2.29.1 (2026-07-28). Dois erros distintos chegam com o
 * mesmo HTTP 401, separados só pela mensagem:
 *
 *   - `invalid token`       — a credencial está errada. Trocar o token resolve.
 *   - `unauthorized action` — a credencial está certa, mas esta action não está
 *                             liberada para ela. Trocar o token NÃO resolve; o
 *                             ajuste é nas permissões, dentro do Holyrics.
 *
 * Os dois continuam sendo `credencial_recusada`, porque nenhum se resolve com
 * nova tentativa. O que muda é o `detalhe`, para o log não mandar o operador
 * consertar a coisa errada.
 *
 * Qualquer erro não reconhecido segue virando `resposta_invalida` (falha
 * parcial), nunca queda de disponibilidade — para não confundir "action falhou"
 * com "Holyrics caiu" (FR-004c, FR-017).
 */
export function extrairData(bruto: unknown): Resultado<unknown> {
  const r = envelope.safeParse(bruto);
  if (!r.success) {
    return falha('resposta_invalida', 'envelope fora do formato esperado');
  }

  if (r.data.status === 'error') {
    const texto = JSON.stringify(r.data.error ?? '').toLowerCase();
    if (texto.includes('unauthorized action')) {
      return {
        ok: false,
        motivo: 'credencial_recusada',
        detalhe:
          'action não autorizada para este token — ajuste as permissões no Holyrics, não a credencial',
      };
    }
    if (texto.includes('token') || texto.includes('unauthorized')) {
      return {
        ok: false,
        motivo: 'credencial_recusada',
        detalhe: 'credencial recusada pelo Holyrics',
      };
    }
    return falha('resposta_invalida', `Holyrics devolveu erro: ${texto}`);
  }

  return { ok: true, valor: r.data.data };
}

/**
 * Valida o retorno de GetColorMap: array de posições com componentes 0–255.
 *
 * VERIFICADO no Holyrics 2.29.1 (2026-07-28): sem apresentação em exibição a
 * action devolve `data: null`, igual a GetCurrentPresentation e GetCurrentTheme
 * — a documentação não menciona esse caso. É ausência legítima, não resposta
 * malformada: tratá-la como falha encheria o log de erro falso em todo momento
 * sem projeção, que é a maior parte do tempo antes do culto.
 */
export function lerColorMap(bruto: unknown): Resultado<LeituraDeCor> {
  const envelopado = extrairData(bruto);
  if (!envelopado.ok) return envelopado;

  const data = envelopado.valor;
  if (data === null || data === undefined) {
    return { ok: true, valor: { regioes: [] } };
  }

  if (!Array.isArray(data)) {
    return falha('resposta_invalida', 'color map não veio como array');
  }

  const regioes: Cor[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = corBruta.safeParse(data[i]);
    if (!c.success) {
      return falha(
        'resposta_invalida',
        `posição ${i} do color map fora do formato ou da faixa 0–255`,
      );
    }
    regioes.push(c.data);
  }

  return { ok: true, valor: { regioes } };
}

/** Valida GetCurrentPresentation. `data: null` é ausência, não erro (FR-003). */
export function lerApresentação(
  bruto: unknown,
): Resultado<ItemEmExibição | null> {
  const envelopado = extrairData(bruto);
  if (!envelopado.ok) return envelopado;

  const data = envelopado.valor;
  if (data === null || data === undefined) return { ok: true, valor: null };

  const p = itemBruto.safeParse(data);
  if (!p.success) {
    return falha('resposta_invalida', 'apresentação fora do formato esperado');
  }

  return {
    ok: true,
    valor: {
      id: p.data.id,
      tipo: p.data.type ?? 'desconhecido',
      nome: p.data.name ?? '',
      slide: p.data.slide_number ?? null,
      totalDeSlides: p.data.total_slides ?? null,
    },
  };
}

/** Valida GetCurrentTheme. Tema ausente não impede a leitura de cor (FR-005c). */
export function lerTema(bruto: unknown): Resultado<Tema | null> {
  const envelopado = extrairData(bruto);
  if (!envelopado.ok) return envelopado;

  const data = envelopado.valor;
  if (data === null || data === undefined) return { ok: true, valor: null };

  const t = temaBruto.safeParse(data);
  if (!t.success) {
    return falha('resposta_invalida', 'tema fora do formato esperado');
  }

  return {
    ok: true,
    valor: {
      id: t.data.id,
      nome: t.data.name ?? '',
      tags: t.data.tags ?? [],
    },
  };
}
