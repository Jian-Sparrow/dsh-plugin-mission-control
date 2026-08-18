import { describe, expect, it } from 'vitest'

import { createCostTracker, estimateCost } from '../../src/host/cost.ts'

const OFF_PEAK = Date.parse('2026-08-18T05:51:00.000Z')

function step(
  turn: number,
  index: number,
  provider: string,
  model: string,
  usage: object,
): readonly unknown[] {
  return [
    { type: 'step/start', data: { turn, step: index }, time: OFF_PEAK },
    {
      type: 'request/header',
      data: { header: { config: { provider, model } }, reason: 'initial' },
      time: OFF_PEAK + 1,
    },
    {
      type: 'assistant/message',
      data: {
        turn,
        step: index,
        message: { role: 'assistant', content: [] },
        usage,
      },
      time: OFF_PEAK + 2,
    },
  ]
}

describe('cost tracker', () => {
  it('prices every official bucket in CNY', () => {
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
    expect(estimate.cny).toBeCloseTo(6.05)
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
    expect(estimateCost(createCostTracker(events)).cny).toBeCloseTo(4.5)
  })

  it('inherits the latest request route across later steps', () => {
    const usage = { inputTokens: 0, outputTokens: 1_000_000 }
    const estimate = estimateCost(createCostTracker([
      ...step(1, 1, 'deepseek-official', 'deepseek-v4-pro', usage),
      { type: 'step/start', data: { turn: 2, step: 1 }, time: OFF_PEAK + 4 },
      {
        type: 'assistant/message',
        data: {
          turn: 2,
          step: 1,
          message: { role: 'assistant', content: [] },
          usage,
        },
        time: OFF_PEAK + 5,
      },
    ]))

    expect(estimate.cny).toBeCloseTo(27)
    expect(estimate).toMatchObject({ pricedSteps: 2, unpricedSteps: 0 })
  })

  it('fully prices the reported multi-step Session', () => {
    const usages = [
      [74, 158, 14_336],
      [111, 301, 14_464],
      [381, 209, 14_464],
      [272, 125, 14_720],
      [444, 432, 15_104],
      [115, 180, 15_872],
      [566, 559, 16_128],
      [106, 79, 17_152],
    ] as const
    const events: unknown[] = []
    for (const [index, [inputTokens, outputTokens, cacheReadTokens]] of usages.entries()) {
      events.push(
        { type: 'step/start', data: { turn: index + 1, step: 1 }, time: OFF_PEAK + index },
        ...index === 0
          ? [{
              type: 'request/header',
              data: {
                header: {
                  config: {
                    provider: 'deepseek-official',
                    model: 'deepseek-v4-pro',
                  },
                },
                reason: 'initial',
              },
              time: OFF_PEAK,
            }]
          : [],
        {
          type: 'assistant/message',
          data: {
            turn: index + 1,
            step: 1,
            message: { role: 'assistant', content: [] },
            usage: { inputTokens, outputTokens, cacheReadTokens },
          },
          time: OFF_PEAK + index,
        },
      )
    }

    expect(estimateCost(createCostTracker(events))).toMatchObject({
      cny: 0.055227,
      pricedSteps: 8,
      unpricedSteps: 0,
    })
  })

  it('prices model switches per step', () => {
    const usage = { inputTokens: 0, outputTokens: 1_000_000 }
    const estimate = estimateCost(
      createCostTracker([
        ...step(1, 1, 'deepseek-official', 'deepseek-v4-flash', usage),
        ...step(1, 2, 'deepseek-official', 'deepseek-v4-pro', usage),
      ]),
    )
    expect(estimate.cny).toBeCloseTo(18)
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
      cny: 0,
      pricedSteps: 0,
      unpricedSteps: 2,
      breakdown: [],
    })
  })
})
