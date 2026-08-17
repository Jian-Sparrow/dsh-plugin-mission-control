import { describe, expect, it } from 'vitest'

import { parseMissionMessage } from '../src/protocol.ts'

const flashPrice = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  cacheHitUsdPerMillion: 0.0028,
  cacheMissUsdPerMillion: 0.14,
  outputUsdPerMillion: 0.28,
  cacheWriteUsdPerMillion: 0,
} as const

const pricing = {
  revision: 'deepseek-2026-08-17',
  priceCheckedAt: '2026-08-17',
  priceSource: 'https://api-docs.deepseek.com/quick_start/pricing',
  usdToCny: 6.7894,
  fxEffectiveAt: '2026-07-31',
  fxSource: 'https://fec.mofcom.gov.cn/article/zyfw/jrfw/jrfwywzn/jrfwwh/hlfxglzy/202607/7208.html',
} as const

const cost = {
  usd: 0.1,
  cny: 0.67894,
  pricedSteps: 1,
  unpricedSteps: 0,
  breakdown: [{
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    price: flashPrice,
    tokens: {
      uncachedInputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    usd: 0.1,
    cny: 0.67894,
  }],
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    type: 'snapshot' as const,
    subscriptionId: 's1',
    generation: 1,
    snapshot: {
      rootId: 'root',
      agents: [],
      tools: [],
      totals: {
        uncachedInputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      cost,
      pricing,
      diagnostics: 0,
      ...overrides,
    },
  }
}

describe('parseMissionMessage', () => {
  it('accepts a valid initial snapshot', () => {
    expect(
      parseMissionMessage({ ...snapshot(), generation: 2 }),
    ).toMatchObject({ type: 'snapshot', generation: 2 })
  })

  it('accepts a complete valid cost snapshot', () => {
    const message = snapshot({ cost, pricing })
    expect(parseMissionMessage(message)).toEqual(message)
  })

  it('rejects negative or nonfinite estimates', () => {
    expect(() =>
      parseMissionMessage(snapshot({ cost: { ...cost, cny: -1 } })),
    ).toThrow()
    expect(() =>
      parseMissionMessage(snapshot({
        cost: { ...cost, usd: Number.POSITIVE_INFINITY },
      })),
    ).toThrow()
  })

  it('rejects malformed catalog metadata', () => {
    expect(() =>
      parseMissionMessage(snapshot({
        pricing: { ...pricing, priceCheckedAt: 'today' },
      })),
    ).toThrow()
  })

  it('rejects an incomplete frame with a negative sequence', () => {
    expect(() =>
      parseMissionMessage({ type: 'agent/status', streamSeq: -1 }),
    ).toThrow()
  })
})
