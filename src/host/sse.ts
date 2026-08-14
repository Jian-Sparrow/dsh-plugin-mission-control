import type { IncomingMessage, ServerResponse } from 'node:http'

import type { MissionMessage } from '../protocol.ts'
import type {
  MissionSink,
  MissionSubscription,
} from './runtime.ts'

/** Same-origin endpoint used by the browser plugin. */
export const EVENTS_PATH = '/plugins/mission-control/events'

/** Runtime surface required by the HTTP transport. */
export interface MissionRuntime {
  open(rootId: string, generation: number, sink: MissionSink): MissionSubscription
}

/** @returns one standard SSE data record for a validated message. */
export function sseData(message: MissionMessage): string {
  return `data: ${JSON.stringify(message)}\n\n`
}

/** HTTP/SSE adapter owning every open response and its runtime subscription. */
export class MissionSseEndpoint {
  private readonly connections = new Set<SseConnection>()

  constructor(
    private readonly runtime: MissionRuntime,
    private readonly maxPendingFrames: number,
  ) {}

  /**
   * Validate and serve one exact-route HTTP request.
   * @param req - Node request dispatched by the Harness Web server.
   * @param res - response owned by this endpoint.
   */
  handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      respond(res, 405, 'method not allowed', { allow: 'GET, HEAD' })
      return
    }
    const query = parseQuery(req.url)
    if (query === undefined) {
      respond(res, 400, 'invalid Mission Control query')
      return
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, sseHeaders())
      res.end()
      return
    }

    const buffered: MissionMessage[] = []
    let liveSink: MissionSink | undefined
    let subscription: MissionSubscription
    try {
      subscription = this.runtime.open(query.sessionId, query.generation, {
        send: message => {
          if (liveSink === undefined) buffered.push(message)
          else liveSink.send(message)
        },
      })
    } catch (error) {
      if (error instanceof Error
        && error.message === `Mission Control cannot observe Session "${query.sessionId}": it is not live`) {
        respond(res, 404, 'Session is not live')
        return
      }
      respond(res, 500, 'Mission Control subscription failed')
      return
    }

    res.writeHead(200, sseHeaders())
    const connection = new SseConnection(
      res,
      subscription,
      this.maxPendingFrames,
      () => this.connections.delete(connection),
    )
    this.connections.add(connection)
    liveSink = connection
    connection.write(': connected\n\n')
    for (const message of buffered) connection.send(message)
  }

  /** Close every stream opened by this endpoint. */
  dispose(): void {
    for (const connection of [...this.connections]) connection.destroy()
  }
}

class SseConnection implements MissionSink {
  private readonly pending: string[] = []
  private blocked = false
  private closed = false

  constructor(
    private readonly response: ServerResponse,
    private readonly subscription: MissionSubscription,
    private readonly maximumPending: number,
    private readonly onClosed: () => void,
  ) {
    response.once('close', this.onResponseClose)
    response.on('drain', this.onDrain)
  }

  send(message: MissionMessage): void {
    this.write(sseData(message))
  }

  write(line: string): void {
    if (this.closed) return
    if (this.blocked) {
      if (this.pending.length >= this.maximumPending) {
        this.destroy()
        return
      }
      this.pending.push(line)
      return
    }
    this.blocked = !this.response.write(line)
  }

  destroy(): void {
    if (this.closed) return
    this.close()
    this.response.destroy()
  }

  private readonly onDrain = (): void => {
    if (this.closed) return
    this.blocked = false
    while (this.pending.length > 0 && !this.blocked) {
      const line = this.pending.shift()
      if (line !== undefined) this.blocked = !this.response.write(line)
    }
  }

  private readonly onResponseClose = (): void => {
    this.close()
  }

  private close(): void {
    if (this.closed) return
    this.closed = true
    this.pending.length = 0
    this.response.off('close', this.onResponseClose)
    this.response.off('drain', this.onDrain)
    this.subscription.close()
    this.onClosed()
  }
}

function parseQuery(rawUrl: string | undefined): {
  sessionId: string
  generation: number
} | undefined {
  let url: URL
  try {
    url = new URL(rawUrl ?? '', 'http://mission-control.local')
  } catch {
    return undefined
  }
  const sessionIds = url.searchParams.getAll('sessionId')
  const generations = url.searchParams.getAll('generation')
  if (sessionIds.length !== 1 || sessionIds[0] === '' || generations.length !== 1) {
    return undefined
  }
  const rawGeneration = generations[0]
  if (rawGeneration === undefined || !/^(?:0|[1-9]\d*)$/u.test(rawGeneration)) {
    return undefined
  }
  const generation = Number(rawGeneration)
  if (!Number.isSafeInteger(generation)) return undefined
  return { sessionId: sessionIds[0]!, generation }
}

function sseHeaders(): Record<string, string> {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  }
}

function respond(
  response: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    ...headers,
  })
  response.end(body)
}
