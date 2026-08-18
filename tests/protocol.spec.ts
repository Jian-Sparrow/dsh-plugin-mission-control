import { describe, expect, it } from 'vitest'

import { parseMissionMessage } from '../src/protocol.ts'

const flashPrice = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  period: 'off-peak',
  cacheHitCnyPerMillion: 0.05,
  cacheMissCnyPerMillion: 1.5,
  outputCnyPerMillion: 4.5,
  cacheWriteCnyPerMillion: 0,
} as const

const pricing = {
  revision: 'deepseek-2026-08-18',
  priceCheckedAt: '2026-08-18',
  priceSource: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  timeZone: 'Asia/Shanghai',
  peakHours: '09:00-12:00, 14:00-18:00',
} as const

const cost = {
  cny: 0.1,
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
    cny: 0.1,
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
        cost: { ...cost, cny: Number.POSITIVE_INFINITY },
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
