import { describe, expect, it } from 'vitest'

import { parseMissionMessage } from '../src/protocol.ts'

describe('parseMissionMessage', () => {
  it('accepts a valid initial snapshot', () => {
    expect(
      parseMissionMessage({
        type: 'snapshot',
        subscriptionId: 's1',
        generation: 2,
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
          diagnostics: 0,
        },
      }),
    ).toMatchObject({ type: 'snapshot', generation: 2 })
  })

  it('rejects an incomplete frame with a negative sequence', () => {
    expect(() =>
      parseMissionMessage({ type: 'agent/status', streamSeq: -1 }),
    ).toThrow()
  })
})
