/**
 * Progressão do intervalo entre tentativas de reconexão.
 *
 * Núcleo puro: dado quantas falhas seguidas houve, quanto esperar. Sem relógio,
 * sem timer, sem estado (FR-015, FR-015b).
 */

export interface LimitesDeReconexão {
  readonly intervaloInicialMs: number;
  readonly intervaloMaximoMs: number;
}

/**
 * Quanto esperar antes da próxima tentativa.
 *
 * Dobra a cada falha consecutiva e para de crescer no teto. O teto não é
 * estético: ele é o que mantém o SC-005 alcançável — se o intervalo crescesse
 * indefinidamente, o Holyrics poderia voltar às 19h30 e o integrador só
 * perceber minutos depois.
 *
 * `falhasConsecutivas === 0` (ou seja, depois de um sucesso) devolve o intervalo
 * inicial, para que uma segunda queda não herde o intervalo longo da primeira.
 */
export function próximoIntervalo(
  falhasConsecutivas: number,
  limites: LimitesDeReconexão,
): number {
  const expoente = Math.max(0, falhasConsecutivas - 1);
  const cru = limites.intervaloInicialMs * 2 ** expoente;
  return Math.min(cru, limites.intervaloMaximoMs);
}
