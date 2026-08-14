import { describe, expect, it } from 'vitest'

import { snapshotMission } from '../../src/host/snapshot.ts'

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
    const root = session('root', 10)
    const child = session(
      'child',
      20,
      { parentSession: 'root', origin: 'subagent' },
      [
        {
          type: 'tool/call',
          time: 30,
          data: { callId: 'c1', name: 'bash', arguments: '{"command":"pwd"}' },
        },
      ],
    )
    const grandchild = session('grandchild', 40, {
      parentSession: 'child',
      origin: 'subagent',
    })
    const ordinaryFork = session('fork', 50, { parentSession: 'root' })
    const unrelated = session('other', 60)
    const all = [root, child, grandchild, ordinaryFork, unrelated]
    const projections = new Map<string, Record<string, unknown>>([
      ['root', { title: { title: 'Root task' }, tokenUsage: tokens(4) }],
      ['child', { subagent: { mode: 'one-shot', label: 'Research', seq: 0 }, tokenUsage: tokens(3) }],
      ['grandchild', { title: { title: 'Deep scan' }, tokenUsage: tokens(2) }],
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
      'grandchild',
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

function emptyServices() {
  return {
    sessions: { list: () => [], get: () => undefined },
    agents: { get: () => undefined },
    projections: { snapshot: () => ({ values: {} }) },
  }
}
