import type {
  AgentPresentationStatus,
  AgentView,
  MissionSnapshot,
  TokenBuckets,
  ToolView,
} from '../protocol.ts'
import {
  emptyToolState,
  finishTool,
  startTool,
  type ToolCallEvent,
  type ToolResultEvent,
} from './tool-state.ts'

/** Session fields needed to discover topology and active Tool calls. */
export interface SnapshotSession {
  readonly id: string
  readonly header: {
    readonly createdAt: number
    readonly parentSession?: string | undefined
    readonly origin?: 'subagent' | undefined
  }
  readonly events: readonly unknown[]
}

/** Host services used to construct one consistent initial view. */
export interface SnapshotServices {
  readonly sessions: {
    list(): readonly SnapshotSession[]
    get(id: string): SnapshotSession | undefined
  }
  readonly agents: {
    get(id: string): { readonly status: 'idle' | 'running' } | undefined
  }
  readonly projections: {
    snapshot(session: SnapshotSession): {
      readonly values: Readonly<Record<string, unknown>>
    }
  }
}

const ZERO_TOKENS: TokenBuckets = {
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

/**
 * Test whether a Session belongs to the root's uninterrupted subagent lineage.
 * @param rootId - selected root Session.
 * @param candidate - possible descendant.
 * @param sessions - current live Session index.
 * @returns true only when every non-root link is a subagent Session.
 */
export function isDescendantOf(
  rootId: string,
  candidate: SnapshotSession,
  sessions: ReadonlyMap<string, SnapshotSession>,
): boolean {
  if (candidate.id === rootId) return true
  const visited = new Set<string>()
  let current: SnapshotSession | undefined = candidate
  while (current !== undefined && current.id !== rootId) {
    if (visited.has(current.id) || current.header.origin !== 'subagent') {
      return false
    }
    visited.add(current.id)
    const parentId = current.header.parentSession
    if (parentId === undefined) return false
    current = sessions.get(parentId)
  }
  return current?.id === rootId
}

/**
 * Fold one Session log into its currently open Tool calls.
 * @param session - live Session log to inspect.
 * @returns running Tool rows with raw arguments removed.
 */
export function openToolsOf(session: SnapshotSession): readonly ToolView[] {
  let state = emptyToolState()
  for (const event of session.events) {
    if (isToolCall(event)) {
      state = startTool(state, session.id, event)
    } else if (isToolResult(event)) {
      state = finishTool(state, session.id, event)
    }
  }
  return [...state.tools.values()]
    .filter(record => record.tool.status === 'running')
    .map(record => record.tool)
}

/**
 * Construct the selected live Session tree, active Tools, and exact token totals.
 * @param rootId - current conversation Session id.
 * @param services - live Session, Agent, and projection readers.
 * @returns the initial Mission Control snapshot.
 */
export function snapshotMission(
  rootId: string,
  services: SnapshotServices,
): MissionSnapshot {
  if (services.sessions.get(rootId) === undefined) {
    throw new Error(`Mission Control cannot observe Session "${rootId}": it is not live`)
  }

  const sessions = services.sessions.list()
  const byId = new Map(sessions.map(session => [session.id, session]))
  const included = sessions.filter(session => isDescendantOf(rootId, session, byId))
  const agents: AgentView[] = []
  const tools: ToolView[] = []
  let totals = ZERO_TOKENS

  for (const session of included) {
    const projection = services.projections.snapshot(session).values
    const tokens = readTokens(projection.tokenUsage)
    if (tokens === undefined) {
      throw new Error('Mission Control requires the tokenUsage projection')
    }
    const agent = services.agents.get(session.id)
    agents.push({
      id: session.id,
      ...(session.id === rootId
        ? {}
        : { parentId: session.header.parentSession }),
      label: readLabel(projection) ?? session.id,
      local: agent !== undefined,
      startedAt: session.header.createdAt,
      status: initialStatus(agent),
      tokens,
    })
    tools.push(...openToolsOf(session))
    totals = addTokens(totals, tokens)
  }

  return { rootId, agents, tools, totals, diagnostics: 0 }
}

function initialStatus(
  agent: { readonly status: 'idle' | 'running' } | undefined,
): AgentPresentationStatus {
  return agent?.status === 'running' ? 'responding' : 'idle'
}

function readLabel(values: Readonly<Record<string, unknown>>): string | undefined {
  const subagent = values.subagent
  if (isRecord(subagent) && typeof subagent.label === 'string') {
    return subagent.label
  }
  const title = values.title
  return isRecord(title) && typeof title.title === 'string'
    ? title.title
    : undefined
}

function readTokens(value: unknown): TokenBuckets | undefined {
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

function addTokens(left: TokenBuckets, right: TokenBuckets): TokenBuckets {
  return {
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  }
}

function isToolCall(value: unknown): value is ToolCallEvent & { readonly type: 'tool/call' } {
  if (!isRecord(value) || value.type !== 'tool/call' || !isRecord(value.data)) {
    return false
  }
  return typeof value.time === 'number'
    && typeof value.data.callId === 'string'
    && typeof value.data.name === 'string'
    && typeof value.data.arguments === 'string'
}

function isToolResult(value: unknown): value is ToolResultEvent & { readonly type: 'tool/result' } {
  if (!isRecord(value) || value.type !== 'tool/result' || !isRecord(value.data)) {
    return false
  }
  const message = value.data.message
  return typeof value.time === 'number'
    && isRecord(message)
    && isRecord(message.source)
    && typeof message.source.callId === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
