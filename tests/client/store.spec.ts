import { describe, expect, it } from 'vitest'

import type { MissionMessage, MissionSnapshot } from '../../src/protocol.ts'
import { DEEPSEEK_PRICING } from '../../src/pricing.ts'
import { MissionControlController } from '../../src/client/controller.ts'
import { MissionStore } from '../../src/client/store.ts'

describe('MissionStore', () => {
  it('replaces snapshots, applies ordered deltas, and rejects stale epochs', () => {
    const store = new MissionStore({ generation: 2, maxLiveRows: 2, velocityWindowMs: 5_000 })
    store.receive(snapshotMessage('new', 2, mission('root')))
    store.receive(toolStart('old', 2, 1, 'ignored'))
    store.receive(toolStart('new', 1, 1, 'wrong-generation'))
    store.receive(toolStart('new', 2, 2, 'second'))
    store.receive(toolStart('new', 2, 1, 'stale-sequence'))
    store.receive(toolStart('new', 2, 3, 'third'))
    store.receive(toolStart('new', 2, 4, 'fourth'))

    expect(store.getSnapshot().mission?.tools.map(tool => tool.callId)).toEqual([
      'third',
      'fourth',
    ])

    store.receive(snapshotMessage('replacement', 2, {
      ...mission('root'),
      diagnostics: 4,
    }))
    expect(store.getSnapshot()).toMatchObject({
      connection: 'live',
      mission: { tools: [], diagnostics: 4 },
    })
  })

  it('filters Tool rows and totals to the selected Agent', () => {
    const store = new MissionStore({ generation: 1, maxLiveRows: 10, velocityWindowMs: 5_000 })
    store.receive(snapshotMessage('s1', 1, {
      rootId: 'root',
      agents: [agent('root', 3), agent('child', 7, 'root')],
      tools: [tool('root', 'a'), tool('child', 'b')],
      totals: tokens(10),
      cost: zeroCost(),
      pricing: DEEPSEEK_PRICING.metadata,
      diagnostics: 0,
    }))

    store.selectAgent('child')

    expect(store.getSnapshot().visibleTools.map(item => item.callId)).toEqual(['b'])
    expect(store.getSnapshot().visibleTotals).toEqual(tokens(7))
    store.selectAgent(undefined)
    expect(store.getSnapshot().visibleTools.map(item => item.callId)).toEqual(['a', 'b'])
  })

  it('computes recent token velocity over the configured window', () => {
    let now = 0
    const store = new MissionStore({
      generation: 1,
      maxLiveRows: 10,
      velocityWindowMs: 5_000,
      now: () => now,
    })
    store.receive(snapshotMessage('s1', 1, mission('root')))
    now = 2_000
    store.receive(tokenUpdate('s1', 1, 1, 20, 2_000))
    now = 5_000
    store.receive(tokenUpdate('s1', 1, 2, 50, 5_000))

    expect(store.getSnapshot().recentTokensPerSecond).toBe(10)
  })
})

describe('MissionControlController', () => {
  it('increments the viewing generation and publishes immutable open state', () => {
    const controller = new MissionControlController()
    let notifications = 0
    const unsubscribe = controller.subscribe(() => notifications++)

    controller.open('root')
    const first = controller.getSnapshot()
    controller.open('root')
    const second = controller.getSnapshot()
    controller.close()

    expect(first).toEqual({ open: true, sessionId: 'root', generation: 1 })
    expect(second).toEqual({ open: true, sessionId: 'root', generation: 2 })
    expect(controller.getSnapshot()).toEqual({ open: false })
    expect(notifications).toBe(3)
    unsubscribe()
  })
})

function mission(rootId: string): MissionSnapshot {
  return {
    rootId,
    agents: [agent(rootId, 0)],
    tools: [],
    totals: tokens(0),
    cost: zeroCost(),
    pricing: DEEPSEEK_PRICING.metadata,
    diagnostics: 0,
  }
}

function snapshotMessage(
  subscriptionId: string,
  generation: number,
  snapshot: MissionSnapshot,
): MissionMessage {
  return { type: 'snapshot', subscriptionId, generation, snapshot }
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
    timestamp: streamSeq,
    tool: tool('root', callId),
  }
}

function tokenUpdate(
  subscriptionId: string,
  generation: number,
  streamSeq: number,
  total: number,
  timestamp: number,
): MissionMessage {
  return {
    type: 'token/update',
    subscriptionId,
    generation,
    streamSeq,
    sessionId: 'root',
    timestamp,
    tokens: tokens(total),
    totals: tokens(total),
    cost: zeroCost(),
    totalCost: zeroCost(),
  }
}

function agent(id: string, value: number, parentId?: string) {
  return {
    id,
    ...(parentId === undefined ? {} : { parentId }),
    label: id,
    local: true,
    startedAt: 0,
    status: 'idle' as const,
    tokens: tokens(value),
    cost: zeroCost(),
  }
}

function tool(sessionId: string, callId: string) {
  return {
    key: `${sessionId}:${callId}`,
    sessionId,
    callId,
    name: 'bash',
    startedAt: 0,
    status: 'running' as const,
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
  return { usd: 0, cny: 0, pricedSteps: 0, unpricedSteps: 0, breakdown: [] }
}
