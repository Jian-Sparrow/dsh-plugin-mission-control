import { z } from 'zod'

/** Authoritative token buckets exposed by the Harness token projection. */
export interface TokenBuckets {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

/** UI status derived from Agent, Tool, child, and terminal Session events. */
export type AgentPresentationStatus =
  | 'idle'
  | 'responding'
  | 'tool'
  | 'waiting-child'
  | 'completed'
  | 'error'
  | 'cancelled'
  | 'unavailable'

/** One Session-backed Agent visible in the live topology. */
export interface AgentView {
  readonly id: string
  readonly parentId?: string | undefined
  readonly label: string
  readonly local: boolean
  readonly startedAt: number
  readonly status: AgentPresentationStatus
  readonly tokens: TokenBuckets
}

/** One visible Tool call owned by a Session in the topology. */
export interface ToolView {
  readonly key: string
  readonly sessionId: string
  readonly callId: string
  readonly name: string
  readonly startedAt: number
  readonly finishedAt?: number | undefined
  readonly status: 'running' | 'success' | 'error' | 'cancelled'
  readonly argumentsPreview?: string | undefined
  readonly resultPreview?: string | undefined
}

/** Complete state sent at the start of one viewing epoch. */
export interface MissionSnapshot {
  readonly rootId: string
  readonly agents: readonly AgentView[]
  readonly tools: readonly ToolView[]
  readonly totals: TokenBuckets
  readonly diagnostics: number
}

interface FrameEnvelope {
  readonly subscriptionId: string
  readonly generation: number
  readonly streamSeq: number
  readonly sessionId: string
  readonly timestamp: number
}

/** Incremental state change after the initial snapshot. */
export type MissionFrame =
  | (FrameEnvelope & { readonly type: 'agent/upsert'; readonly agent: AgentView })
  | (FrameEnvelope & {
      readonly type: 'agent/status'
      readonly agentId: string
      readonly status: AgentPresentationStatus
    })
  | (FrameEnvelope & { readonly type: 'tool/start'; readonly tool: ToolView })
  | (FrameEnvelope & { readonly type: 'tool/finish'; readonly tool: ToolView })
  | (FrameEnvelope & {
      readonly type: 'token/update'
      readonly tokens: TokenBuckets
      readonly totals: TokenBuckets
    })
  | (FrameEnvelope & {
      readonly type: 'diagnostic'
      readonly diagnostics: number
      readonly message: string
    })

/** Initial state or one ordered live delta. */
export type MissionMessage =
  | {
      readonly type: 'snapshot'
      readonly subscriptionId: string
      readonly generation: number
      readonly snapshot: MissionSnapshot
    }
  | MissionFrame

const nonNegativeInteger = z.number().int().nonnegative()
const nonNegativeTimestamp = z.number().nonnegative()
const identifier = z.string().min(1)

const tokenBucketsSchema = z.strictObject({
  uncachedInputTokens: nonNegativeInteger,
  outputTokens: nonNegativeInteger,
  cacheReadTokens: nonNegativeInteger,
  cacheWriteTokens: nonNegativeInteger,
})

const agentStatusSchema = z.enum([
  'idle',
  'responding',
  'tool',
  'waiting-child',
  'completed',
  'error',
  'cancelled',
  'unavailable',
])

const agentViewSchema = z.strictObject({
  id: identifier,
  parentId: identifier.optional(),
  label: z.string(),
  local: z.boolean(),
  startedAt: nonNegativeTimestamp,
  status: agentStatusSchema,
  tokens: tokenBucketsSchema,
})

const toolViewSchema = z.strictObject({
  key: identifier,
  sessionId: identifier,
  callId: identifier,
  name: identifier,
  startedAt: nonNegativeTimestamp,
  finishedAt: nonNegativeTimestamp.optional(),
  status: z.enum(['running', 'success', 'error', 'cancelled']),
  argumentsPreview: z.string().optional(),
  resultPreview: z.string().optional(),
})

const missionSnapshotSchema = z.strictObject({
  rootId: identifier,
  agents: z.array(agentViewSchema),
  tools: z.array(toolViewSchema),
  totals: tokenBucketsSchema,
  diagnostics: nonNegativeInteger,
})

const frameEnvelope = {
  subscriptionId: identifier,
  generation: nonNegativeInteger,
  streamSeq: nonNegativeInteger,
  sessionId: identifier,
  timestamp: nonNegativeTimestamp,
}

const missionMessageSchema: z.ZodType<MissionMessage> = z.discriminatedUnion(
  'type',
  [
    z.strictObject({
      type: z.literal('snapshot'),
      subscriptionId: identifier,
      generation: nonNegativeInteger,
      snapshot: missionSnapshotSchema,
    }),
    z.strictObject({
      type: z.literal('agent/upsert'),
      ...frameEnvelope,
      agent: agentViewSchema,
    }),
    z.strictObject({
      type: z.literal('agent/status'),
      ...frameEnvelope,
      agentId: identifier,
      status: agentStatusSchema,
    }),
    z.strictObject({
      type: z.literal('tool/start'),
      ...frameEnvelope,
      tool: toolViewSchema,
    }),
    z.strictObject({
      type: z.literal('tool/finish'),
      ...frameEnvelope,
      tool: toolViewSchema,
    }),
    z.strictObject({
      type: z.literal('token/update'),
      ...frameEnvelope,
      tokens: tokenBucketsSchema,
      totals: tokenBucketsSchema,
    }),
    z.strictObject({
      type: z.literal('diagnostic'),
      ...frameEnvelope,
      diagnostics: nonNegativeInteger,
      message: z.string(),
    }),
  ],
)

/**
 * Validate untrusted SSE JSON as one closed Mission Control message.
 * @param input - parsed JSON received from the live endpoint.
 * @returns a validated snapshot or ordered delta.
 */
export function parseMissionMessage(input: unknown): MissionMessage {
  return missionMessageSchema.parse(input)
}
