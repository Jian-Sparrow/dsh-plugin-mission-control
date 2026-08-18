import { describe, expect, it } from 'vitest'

import type { MissionMessage } from '../../src/protocol.ts'
import { DEEPSEEK_PRICING } from '../../src/pricing.ts'
import { MissionSource, type EventSourceLike } from '../../src/client/source.ts'
import { MissionStore } from '../../src/client/store.ts'

describe('MissionSource', () => {
  it('owns one encoded EventSource and preserves rows while reconnecting', () => {
    const store = new MissionStore({ generation: 4, maxLiveRows: 10, velocityWindowMs: 5_000 })
    const created: FakeEventSource[] = []
    const source = new MissionSource(store, url => {
      const eventSource = new FakeEventSource(url)
      created.push(eventSource)
      return eventSource
    })

    source.open('session with spaces', 4)
    expect(created[0]?.url).toBe(
      '/plugins/mission-control/events?sessionId=session+with+spaces&generation=4',
    )
    created[0]?.message(snapshot('first', 4, 0))
    created[0]?.message(toolStart('first', 4, 1, 'c1'))
    created[0]?.error()

    expect(store.getSnapshot()).toMatchObject({
      connection: 'reconnecting',
      mission: { tools: [{ callId: 'c1' }] },
    })

    created[0]?.message(snapshot('second', 4, 3))
    expect(store.getSnapshot()).toMatchObject({
      connection: 'live',
      mission: { tools: [], diagnostics: 3 },
    })
  })

  it('detaches handlers and closes the browser source idempotently', () => {
    const store = new MissionStore({ generation: 1, maxLiveRows: 10, velocityWindowMs: 5_000 })
    const eventSource = new FakeEventSource('')
    const source = new MissionSource(store, () => eventSource)
    source.open('root', 1)

    source.close()
    source.close()

    expect(eventSource.closed).toBe(1)
    expect(eventSource.onmessage).toBeNull()
    expect(eventSource.onerror).toBeNull()
  })
})

class FakeEventSource implements EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  closed = 0

  constructor(readonly url: string) {}

  message(message: MissionMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>)
  }

  error(): void {
    this.onerror?.(new Event('error'))
  }

  close(): void {
    this.closed++
  }
}

function snapshot(subscriptionId: string, generation: number, diagnostics: number): MissionMessage {
  return {
    type: 'snapshot',
    subscriptionId,
    generation,
    snapshot: {
      rootId: 'root',
      agents: [{
        id: 'root',
        label: 'root',
        local: true,
        startedAt: 0,
        status: 'idle',
        tokens: tokens(0),
        cost: zeroCost(),
      }],
      tools: [],
      totals: tokens(0),
      cost: zeroCost(),
      pricing: DEEPSEEK_PRICING.metadata,
      diagnostics,
    },
  }
}

function toolStart(
  subscriptionId: string,
  generation: number,
  streamSeq: number,
  callId: string,
): MissionMessage {
  return {
    type: 'tool/start',
    subscriptionId,
    generation,
    streamSeq,
    sessionId: 'root',
    timestamp: 1,
    tool: {
      key: `root:${callId}`,
      sessionId: 'root',
      callId,
      name: 'bash',
      startedAt: 1,
      status: 'running',
    },
  }
}

function tokens(value: number) {
  return {
    uncachedInputTokens: value,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
}

function zeroCost() {
  return { cny: 0, pricedSteps: 0, unpricedSteps: 0, breakdown: [] }
}
