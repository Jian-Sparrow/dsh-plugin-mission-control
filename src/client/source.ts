import { parseMissionMessage } from '../protocol.ts'
import type { MissionStore } from './store.ts'

/** Browser EventSource fields owned by MissionSource. */
export interface EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  onopen: ((event: Event) => void) | null
  close(): void
}

/** Factory seam used by browsers and deterministic tests. */
export type EventSourceFactory = (url: string) => EventSourceLike

/** Owns one browser EventSource while allowing native automatic reconnection. */
export class MissionSource {
  private source: EventSourceLike | undefined

  constructor(
    private readonly store: MissionStore,
    private readonly createSource: EventSourceFactory = url => new EventSource(url),
  ) {}

  /**
   * Replace any previous stream with the selected viewing generation.
   * @param sessionId - current Harness Session.
   * @param generation - controller viewing epoch.
   */
  open(sessionId: string, generation: number): void {
    this.closeSource(false)
    this.store.setConnection('connecting')
    const query = new URLSearchParams({
      sessionId,
      generation: String(generation),
    })
    const source = this.createSource(`/plugins/mission-control/events?${query.toString()}`)
    source.onmessage = event => {
      try {
        this.store.receive(parseMissionMessage(JSON.parse(event.data)))
      } catch {
        this.store.setConnection('unavailable')
      }
    }
    source.onerror = () => {
      this.store.setConnection('reconnecting')
    }
    source.onopen = () => {}
    this.source = source
  }

  /** Detach handlers and stop automatic reconnection. */
  close(): void {
    this.closeSource(true)
  }

  private closeSource(markUnavailable: boolean): void {
    const source = this.source
    if (source === undefined) return
    this.source = undefined
    source.onmessage = null
    source.onerror = null
    source.onopen = null
    source.close()
    if (markUnavailable) this.store.setConnection('unavailable')
  }
}
