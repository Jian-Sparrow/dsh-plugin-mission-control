import type {
  MissionFrame,
  MissionMessage,
  MissionSnapshot,
  TokenBuckets,
  ToolView,
} from '../protocol.ts'
import type { CostEstimate } from '../host/cost.ts'

/** Browser connection state shown by the live HUD. */
export type MissionConnection =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'unavailable'

/** Immutable browser view consumed through `useSyncExternalStore`. */
export interface MissionStoreSnapshot {
  readonly connection: MissionConnection
  readonly mission: MissionSnapshot | undefined
  readonly selectedAgentId: string | undefined
  readonly visibleTools: readonly ToolView[]
  readonly visibleTotals: TokenBuckets
  readonly visibleCost: CostEstimate
  readonly recentTokensPerSecond: number
  readonly followingTools: boolean
}

/** Construction policy for one browser viewing generation. */
export interface MissionStoreOptions {
  readonly generation: number
  readonly maxLiveRows: number
  readonly velocityWindowMs: number
  readonly now?: (() => number) | undefined
}

interface TokenSample {
  readonly time: number
  readonly total: number
}

const ZERO_TOKENS: TokenBuckets = {
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

const ZERO_COST: CostEstimate = {
  usd: 0,
  cny: 0,
  pricedSteps: 0,
  unpricedSteps: 0,
  breakdown: [],
}

/** Generation-checked observable reducer for Mission Control SSE messages. */
export class MissionStore {
  private readonly listeners = new Set<() => void>()
  private readonly now: () => number
  private subscriptionId: string | undefined
  private lastStreamSeq = 0
  private samples: TokenSample[] = []
  private state: MissionStoreSnapshot = {
    connection: 'connecting',
    mission: undefined,
    selectedAgentId: undefined,
    visibleTools: [],
    visibleTotals: ZERO_TOKENS,
    visibleCost: ZERO_COST,
    recentTokensPerSecond: 0,
    followingTools: true,
  }

  constructor(private readonly options: MissionStoreOptions) {
    this.now = options.now ?? Date.now
  }

  /** @returns the stable immutable snapshot for the current reducer state. */
  getSnapshot(): MissionStoreSnapshot {
    return this.state
  }

  /**
   * Subscribe to state replacement.
   * @param listener - callback invoked after an observable change.
   * @returns disposer for this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Apply one validated snapshot or ordered delta.
   * @param message - parsed Mission Control wire message.
   */
  receive(message: MissionMessage): void {
    if (message.generation !== this.options.generation) return
    if (message.type === 'snapshot') {
      this.subscriptionId = message.subscriptionId
      this.lastStreamSeq = 0
      const selectedAgentId = this.state.selectedAgentId !== undefined
        && message.snapshot.agents.some(agent => agent.id === this.state.selectedAgentId)
        ? this.state.selectedAgentId
        : undefined
      this.samples = [{ time: this.now(), total: tokenTotal(message.snapshot.totals) }]
      this.replace({
        ...this.state,
        connection: 'live',
        mission: boundSnapshot(message.snapshot, this.options.maxLiveRows),
        selectedAgentId,
        recentTokensPerSecond: 0,
      })
      return
    }
    if (message.subscriptionId !== this.subscriptionId
      || message.streamSeq <= this.lastStreamSeq
      || this.state.mission === undefined) return

    this.lastStreamSeq = message.streamSeq
    const mission = reduceFrame(
      this.state.mission,
      message,
      this.options.maxLiveRows,
    )
    if (message.type === 'token/update') this.recordTokenSample(message.totals)
    this.replace({
      ...this.state,
      mission,
      recentTokensPerSecond: velocity(this.samples),
    })
  }

  /**
   * Update transport state without clearing the current viewing epoch.
   * @param connection - latest browser transport status.
   */
  setConnection(connection: MissionConnection): void {
    if (this.state.connection === connection) return
    this.replace({ ...this.state, connection })
  }

  /**
   * Filter HUD totals and Tool rows to one Agent, or restore the global view.
   * @param agentId - selected Agent id; undefined selects the entire tree.
   */
  selectAgent(agentId: string | undefined): void {
    if (this.state.selectedAgentId === agentId) return
    this.replace({ ...this.state, selectedAgentId: agentId })
  }

  /**
   * Record whether the Tool list should follow its newest row.
   * @param following - true while the viewer remains at the list tail.
   */
  setFollowingTools(following: boolean): void {
    if (this.state.followingTools === following) return
    this.replace({ ...this.state, followingTools: following })
  }

  private recordTokenSample(totals: TokenBuckets): void {
    const time = this.now()
    this.samples.push({ time, total: tokenTotal(totals) })
    const oldest = time - this.options.velocityWindowMs
    this.samples = this.samples.filter(sample => sample.time >= oldest)
  }

  private replace(next: MissionStoreSnapshot): void {
    const selected = next.selectedAgentId === undefined
      ? undefined
      : next.mission?.agents.find(agent => agent.id === next.selectedAgentId)
    this.state = {
      ...next,
      visibleTools: next.mission === undefined
        ? []
        : next.selectedAgentId === undefined
          ? next.mission.tools
          : next.mission.tools.filter(tool => tool.sessionId === next.selectedAgentId),
      visibleTotals: selected?.tokens ?? next.mission?.totals ?? ZERO_TOKENS,
      visibleCost: selected?.cost ?? next.mission?.cost ?? ZERO_COST,
    }
    for (const listener of this.listeners) listener()
  }
}

function reduceFrame(
  snapshot: MissionSnapshot,
  frame: MissionFrame,
  maximumRows: number,
): MissionSnapshot {
  switch (frame.type) {
    case 'agent/upsert':
      return {
        ...snapshot,
        agents: upsert(snapshot.agents, frame.agent, agent => agent.id),
      }
    case 'agent/status':
      return {
        ...snapshot,
        agents: snapshot.agents.map(agent =>
          agent.id === frame.agentId ? { ...agent, status: frame.status } : agent),
      }
    case 'tool/start':
    case 'tool/finish':
      return {
        ...snapshot,
        tools: upsert(snapshot.tools, frame.tool, tool => tool.key).slice(-maximumRows),
      }
    case 'token/update':
      return {
        ...snapshot,
        agents: snapshot.agents.map(agent =>
          agent.id === frame.sessionId
            ? { ...agent, tokens: frame.tokens, cost: frame.cost }
            : agent),
        totals: frame.totals,
        cost: frame.totalCost,
      }
    case 'diagnostic':
      return { ...snapshot, diagnostics: frame.diagnostics }
    default:
      return assertNever(frame)
  }
}

function boundSnapshot(snapshot: MissionSnapshot, maximumRows: number): MissionSnapshot {
  return { ...snapshot, tools: snapshot.tools.slice(-maximumRows) }
}

function upsert<T>(
  values: readonly T[],
  incoming: T,
  keyOf: (value: T) => string,
): T[] {
  const key = keyOf(incoming)
  const index = values.findIndex(value => keyOf(value) === key)
  if (index === -1) return [...values, incoming]
  const next = [...values]
  next[index] = incoming
  return next
}

function tokenTotal(tokens: TokenBuckets): number {
  return tokens.uncachedInputTokens
    + tokens.outputTokens
    + tokens.cacheReadTokens
    + tokens.cacheWriteTokens
}

function velocity(samples: readonly TokenSample[]): number {
  const first = samples[0]
  const last = samples.at(-1)
  if (first === undefined || last === undefined || last.time <= first.time) return 0
  return Math.max(0, (last.total - first.total) / ((last.time - first.time) / 1_000))
}

function assertNever(value: never): never {
  throw new Error(`unsupported Mission Control frame ${JSON.stringify(value)}`)
}
