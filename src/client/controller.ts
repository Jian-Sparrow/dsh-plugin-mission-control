/** Closed or open panel identity exposed through an observable store. */
export type ControllerSnapshot =
  | { readonly open: false }
  | {
      readonly open: true
      readonly sessionId: string | undefined
      readonly generation: number
    }

/** Observable owner of the selected Session and monotonically increasing epoch. */
export class MissionControlController {
  private readonly listeners = new Set<() => void>()
  private generation = 0
  private returnFocus: HTMLElement | undefined
  private state: ControllerSnapshot = { open: false }

  /** @returns the current panel state. */
  getSnapshot(): ControllerSnapshot {
    return this.state
  }

  /**
   * Subscribe to panel state changes.
   * @param listener - callback invoked after open or close.
   * @returns disposer for this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Toggle the panel for one Session, or open its idle state without a Session.
   * @param sessionId - current Harness Session id when one is selected.
   * @param returnFocus - launch control restored after closing.
   */
  toggle(sessionId: string | undefined, returnFocus?: HTMLElement): void {
    if (this.state.open && this.state.sessionId === sessionId) {
      this.close()
      return
    }
    this.returnFocus = returnFocus
    this.state = { open: true, sessionId, generation: ++this.generation }
    this.notify()
  }

  /**
   * Follow a newly selected Session while the panel remains open.
   * @param sessionId - newly selected Session, or undefined for the idle state.
   */
  retarget(sessionId: string | undefined): void {
    if (!this.state.open || this.state.sessionId === sessionId) return
    this.state = { open: true, sessionId, generation: ++this.generation }
    this.notify()
  }

  /** Close the panel without resetting its generation counter. */
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
