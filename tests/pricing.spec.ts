import { describe, expect, it } from 'vitest'

import { findModelPrice } from '../src/pricing.ts'

describe('DeepSeek pricing schedule', () => {
  it('prices both official V4 routes in CNY', () => {
    const timestamp = Date.parse('2026-08-18T05:00:00.000Z')
    expect(findModelPrice(
      'deepseek-official',
      'deepseek-v4-flash',
      timestamp,
    )).toMatchObject({
      cacheHitCnyPerMillion: 0.05,
      cacheMissCnyPerMillion: 1.5,
      outputCnyPerMillion: 4.5,
      cacheWriteCnyPerMillion: 0,
    })
    expect(findModelPrice(
      'deepseek-official',
      'deepseek-v4-pro',
      timestamp,
    )).toMatchObject({
      cacheHitCnyPerMillion: 0.15,
      cacheMissCnyPerMillion: 4.5,
      outputCnyPerMillion: 13.5,
      cacheWriteCnyPerMillion: 0,
    })
  })

  it.each([
    ['2026-08-18T00:59:00.000Z', 'off-peak', 0.15, 4.5, 13.5],
    ['2026-08-18T01:00:00.000Z', 'peak', 0.3, 9, 27],
    ['2026-08-18T04:00:00.000Z', 'off-peak', 0.15, 4.5, 13.5],
    ['2026-08-18T06:00:00.000Z', 'peak', 0.3, 9, 27],
    ['2026-08-18T10:00:00.000Z', 'off-peak', 0.15, 4.5, 13.5],
  ])('uses the China Standard Time band at %s', (
    timestamp,
    period,
    cacheHit,
    cacheMiss,
    output,
  ) => {
    expect(findModelPrice(
      'deepseek-official',
      'deepseek-v4-pro',
      Date.parse(timestamp),
    )).toMatchObject({
      period,
      cacheHitCnyPerMillion: cacheHit,
      cacheMissCnyPerMillion: cacheMiss,
      outputCnyPerMillion: output,
    })
  })

  it('does not price aliases or other providers', () => {
    const timestamp = Date.parse('2026-08-18T05:00:00.000Z')
    expect(findModelPrice(
      'deepseek-official',
      'deepseek-chat',
      timestamp,
    )).toBeUndefined()
    expect(findModelPrice(
      'gateway',
      'deepseek-v4-pro',
      timestamp,
    )).toBeUndefined()
  })
})
