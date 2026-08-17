import { describe, expect, it } from 'vitest'

import { createCostTracker, estimateCost } from '../../src/host/cost.ts'

function step(
  turn: number,
  index: number,
  provider: string,
  model: string,
  usage: object,
): readonly unknown[] {
  return [
    { type: 'step/start', data: { turn, step: index }, time: 1 },
    {
      type: 'request/header',
      data: { header: { config: { provider, model } }, reason: 'initial' },
      time: 2,
    },
    {
      type: 'assistant/message',
      data: {
        turn,
        step: index,
        message: { role: 'assistant', content: [] },
        usage,
      },
      time: 3,
    },
  ]
}

describe('cost tracker', () => {
  it('prices every official bucket and converts the unrounded subtotal to CNY', () => {
    const usage = {
      inputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      outputTokens: 1_000_000,
    }
    const estimate = estimateCost(
      createCostTracker(
        step(1, 1, 'deepseek-official', 'deepseek-v4-flash', usage),
      ),
    )
    expect(estimate.usd).toBeCloseTo(0.4228)
    expect(estimate.cny).toBeCloseTo(0.4228 * 6.7894)
    expect(estimate).toMatchObject({ pricedSteps: 1, unpricedSteps: 0 })
  })

  it('replaces an early usage chunk with finalized usage for the same step', () => {
    const events = [
      { type: 'step/start', data: { turn: 1, step: 1 }, time: 1 },
      {
        type: 'request/header',
        data: {
          header: {
            config: {
              provider: 'deepseek-official',
              model: 'deepseek-v4-flash',
            },
          },
          reason: 'initial',
        },
        time: 2,
      },
      {
        type: 'assistant/chunk',
        data: {
          turn: 1,
          step: 1,
          chunk: {
            type: 'usage',
            usage: { inputTokens: 0, outputTokens: 500_000 },
          },
        },
        time: 3,
      },
      {
        type: 'assistant/message',
        data: {
          turn: 1,
          step: 1,
          message: { role: 'assistant', content: [] },
          usage: { inputTokens: 0, outputTokens: 1_000_000 },
        },
        time: 4,
      },
    ]
    expect(estimateCost(createCostTracker(events)).usd).toBeCloseTo(0.28)
  })

  it('prices model switches per step', () => {
    const usage = { inputTokens: 0, outputTokens: 1_000_000 }
    const estimate = estimateCost(
      createCostTracker([
        ...step(1, 1, 'deepseek-official', 'deepseek-v4-flash', usage),
        ...step(1, 2, 'deepseek-official', 'deepseek-v4-pro', usage),
      ]),
    )
    expect(estimate.usd).toBeCloseTo(1.15)
    expect(estimate.breakdown.map(row => row.model)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ])
  })

  it('marks unknown and missing routes as unpriced instead of free', () => {
    const usage = { inputTokens: 1_000, outputTokens: 1_000 }
    const estimate = estimateCost(
      createCostTracker([
        ...step(1, 1, 'gateway', 'deepseek-v4-pro', usage),
        { type: 'step/start', data: { turn: 1, step: 2 }, time: 4 },
        {
          type: 'assistant/message',
          data: {
            turn: 1,
            step: 2,
            message: { role: 'assistant', content: [] },
            usage,
          },
          time: 5,
        },
      ]),
    )
    expect(estimate).toMatchObject({
      usd: 0,
      cny: 0,
      pricedSteps: 0,
      unpricedSteps: 2,
      breakdown: [],
    })
  })
})
