import type { CostEstimate } from '../host/cost.ts'

/** Cost coverage state shown by the Mission Control HUD. */
export type CostCoverage = 'full' | 'partial' | 'unavailable'

const CNY = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})

/**
 * Classify whether every observed model step has an exact bundled price.
 * @param cost - estimate coverage counters.
 * @returns full, partial, or unavailable coverage.
 */
export function costCoverage(
  cost: Pick<CostEstimate, 'pricedSteps' | 'unpricedSteps'>,
): CostCoverage {
  if (cost.pricedSteps === 0 && cost.unpricedSteps > 0) return 'unavailable'
  return cost.unpricedSteps > 0 ? 'partial' : 'full'
}

/**
 * Format a CNY estimate with precision suitable for small live totals.
 * @param cost - estimate containing the CNY subtotal.
 * @returns a localized CNY value.
 */
export function formatCny(cost: Pick<CostEstimate, 'cny'>): string {
  return CNY.format(cost.cny)
}
