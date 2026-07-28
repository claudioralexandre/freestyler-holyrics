/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ ⚠️  CONTRATO NÃO VERIFICADO                                                │
 * │                                                                           │
 * │ As formas validadas aqui vieram da DOCUMENTAÇÃO pública do Holyrics API   │
 * │ Server, não de observação da ferramenta em execução.                      │
 * │                                                                           │
 * │ O Princípio I da constitution permite construir sobre contrato presumido  │
 * │ apenas enquanto a suposição estiver marcada — é o que este bloco faz.     │
 * │                                                                           │
 * │ Fonte:  specs/001-leitura-cor-holyrics/contracts/holyrics-api.md          │
 * │ Remover este aviso somente após executar a tarefa T064 (verificação).     │
 * │                                                                           │
 * │ Ainda NÃO observado:                                                      │
 * │   - se o color map traz sempre exatamente 8 posições                      │
 * │   - se os componentes são de fato inteiros 0–255                          │
 * │   - se `id` do item é estável enquanto ele está em exibição               │
 * │   - se `slide_number` começa em 0 ou em 1                                 │
 * │   - o que o color map devolve quando não há apresentação                  │
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

const corBruta = z.object({
  red: z.int().min(0).max(255),
  green: z.int().min(0).max(255),
  blue: z.int().min(0).max(255),
});

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
 * Distinguir token recusado de outro erro depende de uma string que a
 * documentação não fixa. Enquanto não verificado, a regra é conservadora:
 * qualquer erro não reconhecido vira `resposta_invalida` (falha parcial), nunca
 * queda de disponibilidade — para não confundir "action falhou" com "Holyrics
 * caiu" (FR-004c, FR-017).
 */
export function extrairData(bruto: unknown): Resultado<unknown> {
  const r = envelope.safeParse(bruto);
  if (!r.success) {
    return falha('resposta_invalida', 'envelope fora do formato esperado');
  }

  if (r.data.status === 'error') {
    const texto = JSON.stringify(r.data.error ?? '').toLowerCase();
    if (texto.includes('token') || texto.includes('unauthorized')) {
      return { ok: false, motivo: 'credencial_recusada' };
    }
    return falha('resposta_invalida', `Holyrics devolveu erro: ${texto}`);
  }

  return { ok: true, valor: r.data.data };
}

/** Valida o retorno de GetColorMap: array de posições com componentes 0–255. */
export function lerColorMap(bruto: unknown): Resultado<LeituraDeCor> {
  const envelopado = extrairData(bruto);
  if (!envelopado.ok) return envelopado;

  const data = envelopado.valor;
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
    regioes.push({ r: c.data.red, g: c.data.green, b: c.data.blue });
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
