import { describe, expect, it } from 'vitest'

import { snapshotMission } from '../../src/host/snapshot.ts'
import { DEEPSEEK_PRICING } from '../../src/pricing.ts'

interface FakeSession {
  readonly id: string
  readonly header: {
    readonly createdAt: number
    readonly parentSession?: string
    readonly origin?: 'subagent'
  }
  readonly events: readonly unknown[]
}

function session(
  id: string,
  createdAt: number,
  header: Omit<FakeSession['header'], 'createdAt'> = {},
  events: readonly unknown[] = [],
): FakeSession {
  return { id, header: { createdAt, ...header }, events }
}

describe('snapshotMission', () => {
  it('includes only the root and its Session-backed subagent descendants', () => {
    const root = session(
      'root',
      10,
      {},
      usageEvents('deepseek-official', 'deepseek-v4-flash'),
    )
    const child = session(
      'child',
      20,
      { parentSession: 'root', origin: 'subagent' },
      [
        ...usageEvents('deepseek-official', 'deepseek-v4-pro'),
        {
          type: 'tool/call',
          time: 30,
          data: { callId: 'c1', name: 'bash', arguments: '{"command":"pwd"}' },
        },
      ],
    )
    const unknown = session(
      'unknown',
      40,
      { parentSession: 'child', origin: 'subagent' },
      usageEvents('gateway', 'deepseek-v4-pro'),
    )
    const ordinaryFork = session('fork', 50, { parentSession: 'root' })
    const unrelated = session('other', 60)
    const all = [root, child, unknown, ordinaryFork, unrelated]
    const projections = new Map<string, Record<string, unknown>>([
      ['root', { title: { title: 'Root task' }, tokenUsage: tokens(4) }],
      ['child', { subagent: { mode: 'one-shot', label: 'Research', seq: 0 }, tokenUsage: tokens(3) }],
      ['unknown', { title: { title: 'Deep scan' }, tokenUsage: tokens(2) }],
      ['fork', { tokenUsage: tokens(100) }],
      ['other', { tokenUsage: tokens(100) }],
    ])

    const snapshot = snapshotMission('root', {
      sessions: {
        list: () => all,
        get: id => all.find(item => item.id === id),
      },
      agents: {
        get: id => id === 'child' ? { status: 'running' } : { status: 'idle' },
      },
      projections: {
        snapshot: current => ({ values: projections.get(current.id) ?? {} }),
      },
    })

    expect(snapshot.agents.map(agent => agent.id)).toEqual([
      'root',
      'child',
      'unknown',
    ])
    expect(snapshot.agents.map(agent => agent.label)).toEqual([
      'Root task',
      'Research',
      'Deep scan',
    ])
    expect(snapshot.tools).toEqual([
      {
        key: 'child:c1',
        sessionId: 'child',
        callId: 'c1',
        name: 'bash',
        status: 'running',
        startedAt: 30,
      },
    ])
    expect(snapshot.totals).toEqual(tokens(9))
    expect(snapshot.agents.find(agent => agent.id === 'root')?.cost).toMatchObject({
      pricedSteps: 1,
      unpricedSteps: 0,
    })
    expect(snapshot.agents.find(agent => agent.id === 'child')?.cost).toMatchObject({
      pricedSteps: 1,
      unpricedSteps: 0,
    })
    expect(snapshot.agents.find(agent => agent.id === 'unknown')?.cost).toMatchObject({
      pricedSteps: 0,
      unpricedSteps: 1,
    })
    expect(snapshot.cost.pricedSteps).toBe(2)
    expect(snapshot.cost.unpricedSteps).toBe(1)
    expect(snapshot.pricing).toEqual(DEEPSEEK_PRICING.metadata)
  })

  it('fails loudly when the root is not live', () => {
    expect(() => snapshotMission('missing', emptyServices())).toThrow(
      'Mission Control cannot observe Session "missing": it is not live',
    )
  })

  it('fails loudly when token accounting is unavailable', () => {
    const root = session('root', 10)
    expect(() =>
      snapshotMission('root', {
        sessions: { list: () => [root], get: () => root },
        agents: { get: () => undefined },
        projections: { snapshot: () => ({ values: {} }) },
      }),
    ).toThrow('Mission Control requires the tokenUsage projection')
  })
})

function tokens(value: number) {
  return {
    uncachedInputTokens: value,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
}

function usageEvents(provider: string, model: string): readonly unknown[] {
  return [
    { type: 'step/start', data: { turn: 1, step: 1 }, time: 1 },
    {
      type: 'request/header',
      data: { header: { config: { provider, model } }, reason: 'initial' },
      time: 2,
    },
    {
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 1,
        message: { role: 'assistant', content: [] },
        usage: { inputTokens: 1_000, outputTokens: 1_000 },
      },
      time: 3,
    },
  ]
}

function emptyServices() {
  return {
    sessions: { list: () => [], get: () => undefined },
    agents: { get: () => undefined },
    projections: { snapshot: () => ({ values: {} }) },
  }
}
