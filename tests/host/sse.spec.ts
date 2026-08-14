import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'

import type { MissionMessage } from '../../src/protocol.ts'
import type {
  MissionSink,
  MissionSubscription,
} from '../../src/host/runtime.ts'
import {
  MissionSseEndpoint,
  sseData,
} from '../../src/host/sse.ts'

describe('MissionSseEndpoint', () => {
  it('opens a GET stream with the snapshot as its first data frame', () => {
    const runtime = new TestRuntime()
    const endpoint = new MissionSseEndpoint(runtime, 8)
    const response = new TestResponse()

    endpoint.handle(request('GET', '/plugins/mission-control/events?sessionId=root&generation=3'), response.value)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(response.chunks.filter(chunk => chunk.startsWith('data: '))).toEqual([
      sseData(snapshot('root', 3)),
    ])
    expect(runtime.opens).toBe(1)

    response.emit('close')
    expect(runtime.closes).toBe(1)
  })

  it('answers HEAD without opening a subscription', () => {
    const runtime = new TestRuntime()
    const endpoint = new MissionSseEndpoint(runtime, 8)
    const response = new TestResponse()

    endpoint.handle(request('HEAD', '/plugins/mission-control/events?sessionId=root&generation=1'), response.value)

    expect(response.status).toBe(200)
    expect(response.ended).toBe(true)
    expect(runtime.opens).toBe(0)
  })

  it.each([
    ['POST', '/plugins/mission-control/events?sessionId=root&generation=1', 405],
    ['GET', '/plugins/mission-control/events?generation=1', 400],
    ['GET', '/plugins/mission-control/events?sessionId=a&sessionId=b&generation=1', 400],
    ['GET', '/plugins/mission-control/events?sessionId=root&generation=-1', 400],
    ['GET', '/plugins/mission-control/events?sessionId=root&generation=1&generation=2', 400],
  ] as const)('answers invalid %s request %s with %i', (method, url, status) => {
    const endpoint = new MissionSseEndpoint(new TestRuntime(), 8)
    const response = new TestResponse()

    endpoint.handle(request(method, url), response.value)

    expect(response.status).toBe(status)
    expect(response.ended).toBe(true)
  })

  it('maps a missing live root to 404 before sending stream headers', () => {
    const endpoint = new MissionSseEndpoint(new TestRuntime(true), 8)
    const response = new TestResponse()

    endpoint.handle(request('GET', '/plugins/mission-control/events?sessionId=gone&generation=1'), response.value)

    expect(response.status).toBe(404)
    expect(response.ended).toBe(true)
  })

  it('closes a slow stream when its pending-frame limit is exceeded', () => {
    const runtime = new TestRuntime()
    const endpoint = new MissionSseEndpoint(runtime, 8)
    const response = new TestResponse([true, false])
    endpoint.handle(request('GET', '/plugins/mission-control/events?sessionId=root&generation=1'), response.value)

    for (let index = 1; index <= 9; index++) {
      runtime.send(diagnostic(index))
    }

    expect(response.destroyed).toBe(true)
    expect(runtime.closes).toBe(1)
  })

  it('disposes every open response', () => {
    const runtime = new TestRuntime()
    const endpoint = new MissionSseEndpoint(runtime, 8)
    const first = new TestResponse()
    const second = new TestResponse()
    endpoint.handle(request('GET', '/plugins/mission-control/events?sessionId=a&generation=1'), first.value)
    endpoint.handle(request('GET', '/plugins/mission-control/events?sessionId=b&generation=2'), second.value)

    endpoint.dispose()

    expect(first.destroyed).toBe(true)
    expect(second.destroyed).toBe(true)
    expect(runtime.closes).toBe(2)
  })
})

class TestRuntime {
  opens = 0
  closes = 0
  private sink: MissionSink | undefined

  constructor(private readonly missing = false) {}

  open(rootId: string, generation: number, sink: MissionSink): MissionSubscription {
    if (this.missing) {
      throw new Error(`Mission Control cannot observe Session "${rootId}": it is not live`)
    }
    this.opens++
    this.sink = sink
    sink.send(snapshot(rootId, generation))
    let closed = false
    return {
      close: () => {
        if (closed) return
        closed = true
        this.closes++
      },
    }
  }

  send(message: MissionMessage): void {
    this.sink?.send(message)
  }
}

class TestResponse extends EventEmitter {
  status: number | undefined
  headers: Record<string, string> = {}
  chunks: string[] = []
  ended = false
  destroyed = false
  private writeIndex = 0

  constructor(private readonly writes: readonly boolean[] = []) {
    super()
  }

  readonly value = this as unknown as ServerResponse

  writeHead(status: number, headers: Record<string, string> = {}): this {
    this.status = status
    this.headers = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
    )
    return this
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk)
    return this.writes[this.writeIndex++] ?? true
  }

  end(body?: string): this {
    if (body !== undefined) this.chunks.push(body)
    this.ended = true
    return this
  }

  destroy(): this {
    if (this.destroyed) return this
    this.destroyed = true
    this.emit('close')
    return this
  }
}

function request(method: string, url: string): IncomingMessage {
  return { method, url } as IncomingMessage
}

function snapshot(rootId: string, generation: number): MissionMessage {
  return {
    type: 'snapshot',
    subscriptionId: 's1',
    generation,
    snapshot: {
      rootId,
      agents: [],
      tools: [],
      totals: tokens(0),
      diagnostics: 0,
    },
  }
}

function diagnostic(streamSeq: number): MissionMessage {
  return {
    type: 'diagnostic',
    subscriptionId: 's1',
    generation: 1,
    streamSeq,
    sessionId: 'root',
    timestamp: streamSeq,
    diagnostics: streamSeq,
    message: 'slow',
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
