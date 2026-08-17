/** Closed or open overlay identity exposed through an observable store. */
export type ControllerSnapshot =
  | { readonly open: false }
  | {
      readonly open: true
      readonly sessionId: string
      readonly generation: number
    }

/** Observable owner of the selected Session and monotonically increasing epoch. */
export class MissionControlController {
  private readonly listeners = new Set<() => void>()
  private generation = 0
  private returnFocus: HTMLElement | undefined
  private state: ControllerSnapshot = { open: false }

  /** @returns the current overlay state. */
  getSnapshot(): ControllerSnapshot {
    return this.state
  }

  /**
   * Subscribe to overlay state changes.
   * @param listener - callback invoked after open or close.
   * @returns disposer for this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Open a fresh viewing generation for one Session.
   * @param sessionId - current Harness Session id.
   */
  open(sessionId: string, returnFocus?: HTMLElement): void {
    this.returnFocus = returnFocus
    this.state = { open: true, sessionId, generation: ++this.generation }
    this.notify()
  }

  /** Close the overlay without resetting its generation counter. */
  close(): void {
    if (!this.state.open) return
    this.state = { open: false }
    this.notify()
    const target = this.returnFocus
    this.returnFocus = undefined
    queueMicrotask(() => { target?.focus() })
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
