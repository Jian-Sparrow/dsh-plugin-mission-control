import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedConfig } from '../../src/config.ts'
import type { MissionMessage, TokenBuckets } from '../../src/protocol.ts'
import {
  MissionControlRuntime,
  type RuntimeServices,
} from '../../src/host/runtime.ts'
import type { SnapshotSession } from '../../src/host/snapshot.ts'

afterEach(() => {
  vi.useRealTimers()
})

describe('MissionControlRuntime', () => {
  it('streams only included Sessions with increasing sequence numbers and stops on close', () => {
    const host = new TestHost([
      session('root', 10),
      session('child', 20, 'root'),
      session('other', 30),
    ])
    const runtime = new MissionControlRuntime(host, config())
    const sink = new MemorySink()
    const subscription = runtime.open('root', 7, sink)

    expect(sink.messages).toHaveLength(1)
    expect(sink.messages[0]).toMatchObject({ type: 'snapshot', generation: 7 })

    host.toolCall('child', 'c1', 40)
    host.toolCall('other', 'ignored', 50)
    host.toolResult('child', 'c1', 60)

    expect(sink.messages.filter(message => message.type.startsWith('tool/')))
      .toMatchObject([
        { type: 'tool/start', streamSeq: 1, tool: { callId: 'c1' } },
        { type: 'tool/finish', streamSeq: 2, tool: { callId: 'c1' } },
      ])
    expect(sink.messages.some(message =>
      message.type === 'tool/start' && message.tool.callId === 'ignored'))
      .toBe(false)

    subscription.close()
    host.toolCall('child', 'late', 70)
    expect(sink.messages.some(message =>
      message.type === 'tool/start' && message.tool.callId === 'late'))
      .toBe(false)
  })

  it('adds a new Session-backed child and maps its activity onto the parent', () => {
    const host = new TestHost([session('root', 10)])
    const runtime = new MissionControlRuntime(host, config())
    const sink = new MemorySink()
    runtime.open('root', 1, sink)

    host.createSession(session('child', 20, 'root'))
    host.agentStatus('child', 'running')

    expect(sink.messages).toContainEqual(expect.objectContaining({
      type: 'agent/upsert',
      agent: expect.objectContaining({ id: 'child', parentId: 'root' }),
    }))
    expect(sink.messages).toContainEqual(expect.objectContaining({
      type: 'agent/status',
      agentId: 'child',
      status: 'responding',
    }))
    expect(sink.messages).toContainEqual(expect.objectContaining({
      type: 'agent/status',
      agentId: 'root',
      status: 'waiting-child',
    }))
  })

  it.each([
    [{ kind: 'completed' }, 'completed'],
    [{ kind: 'error', error: { message: 'failed' } }, 'error'],
    [{ kind: 'aborted', reason: { kind: 'user' } }, 'cancelled'],
  ] as const)('maps terminal reason %j to %s', (reason, expected) => {
    const host = new TestHost([session('root', 10), session('child', 20, 'root')])
    const runtime = new MissionControlRuntime(host, config())
    const sink = new MemorySink()
    runtime.open('root', 1, sink)

    host.turnEnd('child', reason, 30)

    expect(sink.messages.at(-1)).toMatchObject({
      type: 'agent/status',
      agentId: 'child',
      status: expected,
    })
  })

  it('coalesces token changes and clears its timer when closed', () => {
    vi.useFakeTimers()
    const host = new TestHost([session('root', 10)])
    const runtime = new MissionControlRuntime(host, config())
    const sink = new MemorySink()
    const subscription = runtime.open('root', 1, sink)

    host.setTokens('root', tokens(5))
    host.setTokens('root', tokens(8))
    expect(sink.messages.filter(message => message.type === 'token/update')).toHaveLength(0)

    vi.advanceTimersByTime(250)
    expect(sink.messages.filter(message => message.type === 'token/update')).toEqual([
      expect.objectContaining({
        sessionId: 'root',
        tokens: tokens(8),
        totals: tokens(8),
      }),
    ])

    host.setTokens('root', tokens(13))
    subscription.close()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(250)
    expect(sink.messages.filter(message => message.type === 'token/update')).toHaveLength(1)
  })

  it('finishes a Tool call that was already open in the initial snapshot', () => {
    const root = session('root', 10)
    root.events.push(toolCallEvent('preexisting', 20))
    const host = new TestHost([root])
    const runtime = new MissionControlRuntime(host, config())
    const sink = new MemorySink()
    runtime.open('root', 1, sink)

    host.toolResult('root', 'preexisting', 30)

    expect(sink.messages.at(-1)).toMatchObject({
      type: 'tool/finish',
      tool: { callId: 'preexisting', status: 'success' },
    })
  })
})

class MemorySink {
  readonly messages: MissionMessage[] = []

  send(message: MissionMessage): void {
    this.messages.push(message)
  }
}

class TestHost implements RuntimeServices {
  private readonly sessionCreated = new Set<(session: SnapshotSession) => void>()
  private readonly sessionDisposed = new Set<(session: SnapshotSession) => void>()
  private readonly sessionEvent = new Set<(session: SnapshotSession, event: unknown) => void>()
  private readonly statusChanged = new Set<(sessionId: string, status: 'idle' | 'running') => void>()
  private readonly projectionChanged = new Set<(
    session: SnapshotSession,
    key: string,
    value: unknown,
  ) => void>()
  private readonly live = new Map<string, MutableSession>()
  private readonly statuses = new Map<string, 'idle' | 'running'>()
  private readonly values = new Map<string, Record<string, unknown>>()

  constructor(initial: readonly MutableSession[]) {
    for (const item of initial) this.install(item)
  }

  readonly sessions = {
    list: (): readonly SnapshotSession[] => [...this.live.values()],
    get: (id: string): SnapshotSession | undefined => this.live.get(id),
  }

  readonly agents = {
    get: (id: string) => {
      const status = this.statuses.get(id)
      return status === undefined ? undefined : { status }
    },
  }

  readonly projections = {
    snapshot: (current: SnapshotSession) => ({
      values: this.values.get(current.id) ?? {},
    }),
  }

  readonly observe = {
    sessionCreated: (listener: (session: SnapshotSession) => void) =>
      subscribe(this.sessionCreated, listener),
    sessionDisposed: (listener: (session: SnapshotSession) => void) =>
      subscribe(this.sessionDisposed, listener),
    sessionEvent: (listener: (session: SnapshotSession, event: unknown) => void) =>
      subscribe(this.sessionEvent, listener),
    agentStatus: (listener: (sessionId: string, status: 'idle' | 'running') => void) =>
      subscribe(this.statusChanged, listener),
    projectionChanged: (listener: (
      session: SnapshotSession,
      key: string,
      value: unknown,
    ) => void) => subscribe(this.projectionChanged, listener),
  }

  createSession(current: MutableSession): void {
    this.install(current)
    for (const listener of this.sessionCreated) listener(current)
  }

  agentStatus(id: string, status: 'idle' | 'running'): void {
    this.statuses.set(id, status)
    for (const listener of this.statusChanged) listener(id, status)
  }

  toolCall(id: string, callId: string, time: number): void {
    this.append(id, toolCallEvent(callId, time))
  }

  toolResult(id: string, callId: string, time: number): void {
    this.append(id, {
      type: 'tool/result',
      time,
      data: {
        message: {
          source: { callId },
          content: [{
            type: 'tool-result',
            content: [{ type: 'text', text: 'done' }],
          }],
        },
      },
    })
  }

  turnEnd(id: string, reason: unknown, time: number): void {
    this.append(id, { type: 'turn/end', time, data: { reason } })
  }

  setTokens(id: string, value: TokenBuckets): void {
    const current = this.live.get(id)
    if (current === undefined) throw new Error(`missing test Session ${id}`)
    this.values.set(id, { ...(this.values.get(id) ?? {}), tokenUsage: value })
    for (const listener of this.projectionChanged) {
      listener(current, 'tokenUsage', value)
    }
  }

  private install(current: MutableSession): void {
    this.live.set(current.id, current)
    this.statuses.set(current.id, 'idle')
    this.values.set(current.id, {
      title: { title: current.id },
      tokenUsage: tokens(0),
    })
  }

  private append(id: string, event: unknown): void {
    const current = this.live.get(id)
    if (current === undefined) throw new Error(`missing test Session ${id}`)
    current.events.push(event)
    for (const listener of this.sessionEvent) listener(current, event)
  }
}

interface MutableSession extends SnapshotSession {
  readonly events: unknown[]
}

function session(id: string, createdAt: number, parentSession?: string): MutableSession {
  return {
    id,
    header: {
      createdAt,
      ...(parentSession === undefined
        ? {}
        : { parentSession, origin: 'subagent' as const }),
    },
    events: [],
  }
}

function toolCallEvent(callId: string, time: number) {
  return {
    type: 'tool/call',
    time,
    data: { callId, name: 'bash', arguments: '{"command":"pwd"}' },
  }
}

function tokens(value: number): TokenBuckets {
  return {
    uncachedInputTokens: value,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
}

function config(): ResolvedConfig {
  return {
    previewMode: 'names-only',
    maxPreviewBytes: 2_048,
    sensitiveFieldNames: [],
    tokenPublishIntervalMs: 250,
    velocityWindowMs: 5_000,
    maxLiveRows: 50,
    maxPendingFrames: 64,
  }
}

function subscribe<T>(listeners: Set<T>, listener: T): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
