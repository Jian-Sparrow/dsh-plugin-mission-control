import { describe, expect, it } from 'vitest'

import {
  costCoverage,
  formatCny,
  formatUsd,
} from '../../src/client/cost-format.ts'

describe('cost formatting', () => {
  it('preserves useful precision for small CNY estimates', () => {
    expect(formatCny({ cny: 0.0000014 })).toBe('¥0.000001')
    expect(formatCny({ cny: 12.34567 })).toBe('¥12.34567')
  })

  it('classifies complete, partial, and unavailable coverage', () => {
    expect(costCoverage({ pricedSteps: 1, unpricedSteps: 0 })).toBe('full')
    expect(costCoverage({ pricedSteps: 1, unpricedSteps: 2 })).toBe('partial')
    expect(costCoverage({ pricedSteps: 0, unpricedSteps: 2 })).toBe('unavailable')
  })

  it('formats the USD source subtotal independently', () => {
    expect(formatUsd({ usd: 0.123456 })).toBe('$0.123456')
  })
})
