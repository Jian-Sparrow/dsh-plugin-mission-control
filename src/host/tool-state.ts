import type { ToolView } from '../protocol.ts'

/** Minimum durable Tool call fields consumed by the live fold. */
export interface ToolCallEvent {
  readonly time: number
  readonly data: {
    readonly callId: string
    readonly name: string
    readonly arguments: string
  }
}

/** Minimum durable Tool result fields consumed by the live fold. */
export interface ToolResultEvent {
  readonly time: number
  readonly data: {
    readonly message: { readonly source: { readonly callId: string } }
    readonly error?: { readonly name: string; readonly code: string } | undefined
  }
}

/** Private Tool record retaining raw payloads for the configured preview policy. */
export interface ToolRecord {
  readonly tool: ToolView
  readonly rawArguments: string
  readonly result?: ToolResultEvent | undefined
}

/** Immutable Tool rows and protocol diagnostics for one subscription. */
export interface ToolState {
  readonly tools: ReadonlyMap<string, ToolRecord>
  readonly diagnostics: number
}

/** @returns an empty immutable Tool fold. */
export function emptyToolState(): ToolState {
  return { tools: new Map(), diagnostics: 0 }
}

/**
 * Add a running Tool call without parsing its model-supplied arguments.
 * @param state - previous subscription Tool state.
 * @param sessionId - Session that owns the call.
 * @param event - durable Tool call event.
 * @returns a new state containing the running call.
 */
export function startTool(
  state: ToolState,
  sessionId: string,
  event: ToolCallEvent,
): ToolState {
  const key = toolKey(sessionId, event.data.callId)
  const tools = new Map(state.tools)
  tools.set(key, {
    tool: {
      key,
      sessionId,
      callId: event.data.callId,
      name: event.data.name,
      startedAt: event.time,
      status: 'running',
    },
    rawArguments: event.data.arguments,
  })
  return { tools, diagnostics: state.diagnostics }
}

/**
 * Complete the matching Tool call or count one unmatched-result diagnostic.
 * @param state - previous subscription Tool state.
 * @param sessionId - Session that owns the result.
 * @param event - durable Tool result event.
 * @returns a new state with the matched row completed.
 */
export function finishTool(
  state: ToolState,
  sessionId: string,
  event: ToolResultEvent,
): ToolState {
  const callId = event.data.message.source.callId
  const key = toolKey(sessionId, callId)
  const existing = state.tools.get(key)
  if (existing === undefined) {
    return { tools: state.tools, diagnostics: state.diagnostics + 1 }
  }

  const tools = new Map(state.tools)
  tools.set(key, {
    ...existing,
    tool: {
      ...existing.tool,
      finishedAt: event.time,
      status: resultStatus(event),
    },
    result: event,
  })
  return { tools, diagnostics: state.diagnostics }
}

/** @returns the collision-free identity for a Tool call inside one Session. */
export function toolKey(sessionId: string, callId: string): string {
  return `${sessionId}:${callId}`
}

function resultStatus(event: ToolResultEvent): ToolView['status'] {
  const code = event.data.error?.code
  if (code === undefined) return 'success'
  if (code === 'ABORTED' || code === 'ABORTED_BEFORE_DISPATCH') {
    return 'cancelled'
  }
  return 'error'
}
