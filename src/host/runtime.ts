import type { ResolvedConfig } from '../config.ts'
import type {
  AgentPresentationStatus,
  AgentView,
  MissionFrame,
  MissionMessage,
  TokenBuckets,
  ToolView,
} from '../protocol.ts'
import { previewArguments, previewResult } from './preview.ts'
import {
  snapshotMission,
  type SnapshotServices,
  type SnapshotSession,
} from './snapshot.ts'
import {
  emptyToolState,
  finishTool,
  startTool,
  type ToolCallEvent,
  type ToolResultEvent,
  type ToolState,
} from './tool-state.ts'

/** Receiver for validated live Mission Control messages. */
export interface MissionSink {
  send(message: MissionMessage): void
}

/** Idempotent handle for one current viewing epoch. */
export interface MissionSubscription {
  close(): void
}

/** Global event adapters required by the host runtime. */
export interface RuntimeObservers {
  sessionCreated(listener: (session: SnapshotSession) => void): () => void
  sessionDisposed(listener: (session: SnapshotSession) => void): () => void
  sessionEvent(listener: (session: SnapshotSession, event: unknown) => void): () => void
  agentStatus(
    listener: (sessionId: string, status: 'idle' | 'running') => void,
  ): () => void
  projectionChanged(
    listener: (session: SnapshotSession, key: string, value: unknown) => void,
  ): () => void
}

/** Snapshot readers plus one registration point for every global event stream. */
export interface RuntimeServices extends SnapshotServices {
  readonly observe: RuntimeObservers
}

interface SubscriptionRecord {
  readonly id: string
  readonly rootId: string
  readonly generation: number
  readonly sink: MissionSink
  readonly included: Set<string>
  readonly agents: Map<string, AgentView>
  readonly tokens: Map<string, TokenBuckets>
  readonly agentRunning: Set<string>
  readonly terminal: Map<string, AgentPresentationStatus>
  tools: ToolState
  nextStreamSeq: number
  pendingTokens: Set<string>
  tokenTimer: ReturnType<typeof setTimeout> | undefined
  closed: boolean
}

const ZERO_TOKENS: TokenBuckets = {
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

/** Live Session observer shared by every open Mission Control view. */
export class MissionControlRuntime {
  private readonly subscriptions = new Map<string, SubscriptionRecord>()
  private readonly observerDisposers: (() => void)[]
  private nextSubscriptionId = 1
  private disposed = false

  constructor(
    private readonly services: RuntimeServices,
    private readonly config: ResolvedConfig,
  ) {
    this.observerDisposers = [
      services.observe.sessionCreated(session => this.onSessionCreated(session)),
      services.observe.sessionDisposed(session => this.onSessionDisposed(session)),
      services.observe.sessionEvent((session, event) => this.onSessionEvent(session, event)),
      services.observe.agentStatus((sessionId, status) => this.onAgentStatus(sessionId, status)),
      services.observe.projectionChanged((session, key, value) =>
        this.onProjectionChanged(session, key, value)),
    ]
  }

  /**
   * Start one live-only viewing epoch and synchronously send its initial snapshot.
   * @param rootId - selected current conversation Session.
   * @param generation - browser epoch used to reject stale messages.
   * @param sink - message receiver owned by the transport.
   * @returns an idempotent subscription handle.
   */
  open(rootId: string, generation: number, sink: MissionSink): MissionSubscription {
    if (this.disposed) throw new Error('Mission Control runtime is disposed')
    const snapshot = snapshotMission(rootId, this.services)
    const id = `mission-${this.nextSubscriptionId++}`
    const agents = new Map(snapshot.agents.map(agent => [agent.id, agent]))
    const tokens = new Map(snapshot.agents.map(agent => [agent.id, agent.tokens]))
    const agentRunning = new Set(
      snapshot.agents
        .filter(agent => this.services.agents.get(agent.id)?.status === 'running')
        .map(agent => agent.id),
    )
    const tools = toolStateFrom(snapshot.tools)
    const record: SubscriptionRecord = {
      id,
      rootId,
      generation,
      sink,
      included: new Set(snapshot.agents.map(agent => agent.id)),
      agents,
      tokens,
      agentRunning,
      terminal: new Map(),
      tools,
      nextStreamSeq: 1,
      pendingTokens: new Set(),
      tokenTimer: undefined,
      closed: false,
    }
    applyDerivedStatuses(record)
    this.subscriptions.set(id, record)
    sink.send({
      type: 'snapshot',
      subscriptionId: id,
      generation,
      snapshot: {
        ...snapshot,
        agents: [...record.agents.values()],
      },
    })
    return { close: () => this.close(record) }
  }

  /** Dispose all observers and active viewing epochs. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const record of [...this.subscriptions.values()]) this.close(record)
    for (const dispose of this.observerDisposers.splice(0).reverse()) dispose()
  }

  private onSessionCreated(session: SnapshotSession): void {
    for (const record of this.subscriptions.values()) {
      const parentId = session.header.parentSession
      if (session.header.origin !== 'subagent'
        || parentId === undefined
        || !record.included.has(parentId)) continue

      const snapshot = snapshotMission(record.rootId, this.services)
      const agent = snapshot.agents.find(candidate => candidate.id === session.id)
      if (agent === undefined) continue
      record.included.add(agent.id)
      record.agents.set(agent.id, agent)
      record.tokens.set(agent.id, agent.tokens)
      if (this.services.agents.get(agent.id)?.status === 'running') {
        record.agentRunning.add(agent.id)
      }
      for (const tool of snapshot.tools.filter(candidate => candidate.sessionId === agent.id)) {
        record.tools = addInitialTool(record.tools, tool)
      }
      this.sendFrame(record, session.id, session.header.createdAt, {
        type: 'agent/upsert',
        agent,
      })
      this.publishDerivedStatuses(record, Date.now())
    }
  }

  private onSessionDisposed(session: SnapshotSession): void {
    for (const record of this.subscriptions.values()) {
      if (!record.included.has(session.id) || session.id === record.rootId) continue
      record.agentRunning.delete(session.id)
      if (!record.terminal.has(session.id)) {
        record.terminal.set(session.id, 'unavailable')
      }
      this.publishDerivedStatuses(record, Date.now())
    }
  }

  private onSessionEvent(session: SnapshotSession, event: unknown): void {
    for (const record of this.subscriptions.values()) {
      if (!record.included.has(session.id)) continue
      if (isToolCall(event)) {
        record.tools = trimToolState(
          startTool(record.tools, session.id, event),
          this.config.maxLiveRows,
        )
        const stored = record.tools.tools.get(`${session.id}:${event.data.callId}`)
        if (stored === undefined) continue
        const argumentsPreview = previewArguments(event.data.arguments, this.config)
        const tool: ToolView = {
          ...stored.tool,
          ...(argumentsPreview === undefined ? {} : { argumentsPreview }),
        }
        replaceToolView(record, tool)
        this.sendFrame(record, session.id, event.time, { type: 'tool/start', tool })
        applyDerivedStatuses(record)
        continue
      }
      if (isToolResult(event)) {
        const previousDiagnostics = record.tools.diagnostics
        record.tools = finishTool(record.tools, session.id, event)
        if (record.tools.diagnostics !== previousDiagnostics) {
          this.sendFrame(record, session.id, event.time, {
            type: 'diagnostic',
            diagnostics: record.tools.diagnostics,
            message: `Tool result ${event.data.message.source.callId} has no visible call`,
          })
          continue
        }
        const stored = record.tools.tools.get(
          `${session.id}:${event.data.message.source.callId}`,
        )
        if (stored === undefined) continue
        const resultPreview = previewResult(event, this.config)
        const tool: ToolView = {
          ...stored.tool,
          ...(resultPreview === undefined ? {} : { resultPreview }),
        }
        replaceToolView(record, tool)
        this.sendFrame(record, session.id, event.time, { type: 'tool/finish', tool })
        applyDerivedStatuses(record)
        continue
      }
      if (isTurnStart(event)) {
        record.terminal.delete(session.id)
        this.publishDerivedStatuses(record, event.time)
        continue
      }
      if (isTurnEnd(event)) {
        record.terminal.set(session.id, terminalStatus(event.data.reason))
        record.agentRunning.delete(session.id)
        this.publishDerivedStatuses(record, event.time)
      }
    }
  }

  private onAgentStatus(sessionId: string, status: 'idle' | 'running'): void {
    for (const record of this.subscriptions.values()) {
      if (!record.included.has(sessionId)) continue
      if (status === 'running') {
        record.agentRunning.add(sessionId)
        record.terminal.delete(sessionId)
      } else {
        record.agentRunning.delete(sessionId)
      }
      this.publishDerivedStatuses(record, Date.now())
    }
  }

  private onProjectionChanged(
    session: SnapshotSession,
    key: string,
    value: unknown,
  ): void {
    for (const record of this.subscriptions.values()) {
      if (!record.included.has(session.id)) continue
      if (key === 'tokenUsage') {
        const tokens = parseTokenBuckets(value)
        if (tokens === undefined) continue
        record.tokens.set(session.id, tokens)
        const agent = record.agents.get(session.id)
        if (agent !== undefined) record.agents.set(session.id, { ...agent, tokens })
        record.pendingTokens.add(session.id)
        this.armTokenTimer(record)
        continue
      }
      if (key !== 'title' && key !== 'subagent') continue
      const snapshot = snapshotMission(record.rootId, this.services)
      const agent = snapshot.agents.find(candidate => candidate.id === session.id)
      if (agent === undefined) continue
      const current = record.agents.get(session.id)
      const next = { ...agent, status: current?.status ?? agent.status }
      record.agents.set(session.id, next)
      this.sendFrame(record, session.id, Date.now(), {
        type: 'agent/upsert',
        agent: next,
      })
    }
  }

  private armTokenTimer(record: SubscriptionRecord): void {
    if (record.tokenTimer !== undefined || record.closed) return
    record.tokenTimer = setTimeout(() => {
      record.tokenTimer = undefined
      if (record.closed) return
      const totals = sumTokens(record.tokens.values())
      for (const sessionId of record.pendingTokens) {
        const tokens = record.tokens.get(sessionId)
        if (tokens === undefined) continue
        this.sendFrame(record, sessionId, Date.now(), {
          type: 'token/update',
          tokens,
          totals,
        })
      }
      record.pendingTokens.clear()
    }, this.config.tokenPublishIntervalMs)
    record.tokenTimer.unref?.()
  }

  private publishDerivedStatuses(record: SubscriptionRecord, timestamp: number): void {
    const previous = new Map(
      [...record.agents].map(([id, agent]) => [id, agent.status]),
    )
    applyDerivedStatuses(record)
    for (const [id, agent] of record.agents) {
      if (previous.get(id) === agent.status) continue
      this.sendFrame(record, id, timestamp, {
        type: 'agent/status',
        agentId: id,
        status: agent.status,
      })
    }
  }

  private sendFrame(
    record: SubscriptionRecord,
    sessionId: string,
    timestamp: number,
    body: FrameBody,
  ): void {
    if (record.closed) return
    const envelope = {
      subscriptionId: record.id,
      generation: record.generation,
      streamSeq: record.nextStreamSeq++,
      sessionId,
      timestamp,
    }
    record.sink.send({ ...envelope, ...body } as MissionFrame)
  }

  private close(record: SubscriptionRecord): void {
    if (record.closed) return
    record.closed = true
    if (record.tokenTimer !== undefined) clearTimeout(record.tokenTimer)
    record.tokenTimer = undefined
    record.pendingTokens.clear()
    this.subscriptions.delete(record.id)
  }
}

type FrameBody =
  | Pick<Extract<MissionFrame, { type: 'agent/upsert' }>, 'type' | 'agent'>
  | Pick<Extract<MissionFrame, { type: 'agent/status' }>, 'type' | 'agentId' | 'status'>
  | Pick<Extract<MissionFrame, { type: 'tool/start' }>, 'type' | 'tool'>
  | Pick<Extract<MissionFrame, { type: 'tool/finish' }>, 'type' | 'tool'>
  | Pick<Extract<MissionFrame, { type: 'token/update' }>, 'type' | 'tokens' | 'totals'>
  | Pick<Extract<MissionFrame, { type: 'diagnostic' }>, 'type' | 'diagnostics' | 'message'>

function toolStateFrom(tools: readonly ToolView[]): ToolState {
  let state = emptyToolState()
  for (const tool of tools) state = addInitialTool(state, tool)
  return state
}

function addInitialTool(state: ToolState, tool: ToolView): ToolState {
  const tools = new Map(state.tools)
  tools.set(tool.key, { tool, rawArguments: '' })
  return { tools, diagnostics: state.diagnostics }
}

function replaceToolView(record: SubscriptionRecord, tool: ToolView): void {
  const stored = record.tools.tools.get(tool.key)
  if (stored === undefined) return
  const tools = new Map(record.tools.tools)
  tools.set(tool.key, { ...stored, tool })
  record.tools = { ...record.tools, tools }
}

function trimToolState(state: ToolState, maximum: number): ToolState {
  if (state.tools.size <= maximum) return state
  const tools = new Map(state.tools)
  while (tools.size > maximum) {
    const oldest = tools.keys().next().value as string | undefined
    if (oldest === undefined) break
    tools.delete(oldest)
  }
  return { tools, diagnostics: state.diagnostics }
}

function applyDerivedStatuses(record: SubscriptionRecord): void {
  const activeTools = new Set(
    [...record.tools.tools.values()]
      .filter(item => item.tool.status === 'running')
      .map(item => item.tool.sessionId),
  )
  const children = new Map<string, string[]>()
  for (const agent of record.agents.values()) {
    if (agent.parentId === undefined) continue
    const group = children.get(agent.parentId) ?? []
    group.push(agent.id)
    children.set(agent.parentId, group)
  }
  const visiting = new Set<string>()
  const resolved = new Map<string, AgentPresentationStatus>()
  const resolve = (id: string): AgentPresentationStatus => {
    const cached = resolved.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 'unavailable'
    visiting.add(id)
    const terminal = record.terminal.get(id)
    let status: AgentPresentationStatus
    if (terminal !== undefined) {
      status = terminal
    } else if (activeTools.has(id)) {
      status = 'tool'
    } else if ((children.get(id) ?? []).some(child => isActive(resolve(child)))) {
      status = 'waiting-child'
    } else if (record.agentRunning.has(id)) {
      status = 'responding'
    } else {
      status = 'idle'
    }
    visiting.delete(id)
    resolved.set(id, status)
    return status
  }
  for (const [id, agent] of record.agents) {
    record.agents.set(id, { ...agent, status: resolve(id) })
  }
}

function isActive(status: AgentPresentationStatus): boolean {
  return status === 'responding' || status === 'tool' || status === 'waiting-child'
}

function terminalStatus(reason: unknown): AgentPresentationStatus {
  if (!isRecord(reason) || typeof reason.kind !== 'string') return 'error'
  if (reason.kind === 'aborted') return 'cancelled'
  if (reason.kind === 'error') return 'error'
  return 'completed'
}

function parseTokenBuckets(value: unknown): TokenBuckets | undefined {
  if (!isRecord(value)) return undefined
  const keys = [
    'uncachedInputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
  ] as const
  if (keys.some(key => !Number.isSafeInteger(value[key]) || Number(value[key]) < 0)) {
    return undefined
  }
  return {
    uncachedInputTokens: Number(value.uncachedInputTokens),
    outputTokens: Number(value.outputTokens),
    cacheReadTokens: Number(value.cacheReadTokens),
    cacheWriteTokens: Number(value.cacheWriteTokens),
  }
}

function sumTokens(values: Iterable<TokenBuckets>): TokenBuckets {
  let total = ZERO_TOKENS
  for (const value of values) {
    total = {
      uncachedInputTokens: total.uncachedInputTokens + value.uncachedInputTokens,
      outputTokens: total.outputTokens + value.outputTokens,
      cacheReadTokens: total.cacheReadTokens + value.cacheReadTokens,
      cacheWriteTokens: total.cacheWriteTokens + value.cacheWriteTokens,
    }
  }
  return total
}

function isToolCall(value: unknown): value is ToolCallEvent & { readonly type: 'tool/call' } {
  return isRecord(value)
    && value.type === 'tool/call'
    && typeof value.time === 'number'
    && isRecord(value.data)
    && typeof value.data.callId === 'string'
    && typeof value.data.name === 'string'
    && typeof value.data.arguments === 'string'
}

function isToolResult(value: unknown): value is ToolResultEvent & { readonly type: 'tool/result' } {
  return isRecord(value)
    && value.type === 'tool/result'
    && typeof value.time === 'number'
    && isRecord(value.data)
    && isRecord(value.data.message)
    && isRecord(value.data.message.source)
    && typeof value.data.message.source.callId === 'string'
}

function isTurnStart(value: unknown): value is {
  readonly type: 'turn/start'
  readonly time: number
} {
  return isRecord(value) && value.type === 'turn/start' && typeof value.time === 'number'
}

function isTurnEnd(value: unknown): value is {
  readonly type: 'turn/end'
  readonly time: number
  readonly data: { readonly reason: unknown }
} {
  return isRecord(value)
    && value.type === 'turn/end'
    && typeof value.time === 'number'
    && isRecord(value.data)
    && 'reason' in value.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
