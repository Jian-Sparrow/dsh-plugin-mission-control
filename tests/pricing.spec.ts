import { describe, expect, it } from 'vitest'

import { DEEPSEEK_PRICING, findModelPrice } from '../src/pricing.ts'

describe('DeepSeek pricing catalog', () => {
  it('ships the checked official V4 prices and CNY reference rate', () => {
    expect(DEEPSEEK_PRICING.metadata).toMatchObject({
      revision: 'deepseek-2026-08-17',
      priceCheckedAt: '2026-08-17',
      usdToCny: 6.7894,
      fxEffectiveAt: '2026-07-31',
    })
    expect(findModelPrice('deepseek-official', 'deepseek-v4-flash')).toMatchObject({
      cacheHitUsdPerMillion: 0.0028,
      cacheMissUsdPerMillion: 0.14,
      outputUsdPerMillion: 0.28,
      cacheWriteUsdPerMillion: 0,
    })
    expect(findModelPrice('deepseek-official', 'deepseek-v4-pro')).toMatchObject({
      cacheHitUsdPerMillion: 0.003625,
      cacheMissUsdPerMillion: 0.435,
      outputUsdPerMillion: 0.87,
      cacheWriteUsdPerMillion: 0,
    })
  })

  it('does not price aliases or other providers', () => {
    expect(findModelPrice('deepseek-official', 'deepseek-chat')).toBeUndefined()
    expect(findModelPrice('gateway', 'deepseek-v4-pro')).toBeUndefined()
  })
})
