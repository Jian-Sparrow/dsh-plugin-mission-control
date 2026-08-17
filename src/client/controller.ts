/** Closed or open panel identity exposed through an observable store. */
export type ControllerSnapshot =
  | { readonly open: false }
  | {
      readonly open: true
      readonly sessionId?: string
      readonly generation: number
    }

/** Observable owner of the selected Session and monotonically increasing epoch. */
export class MissionControlController {
  private readonly listeners = new Set<() => void>()
  private generation = 0
  private returnFocus: HTMLElement | undefined
  private sidebarWide: boolean | undefined
  private state: ControllerSnapshot = { open: false }

  /**
   * @param toggleSidebar Existing Harness layout action used to reveal a collapsed rail.
   */
  constructor(private readonly toggleSidebar: () => void = () => {}) {}

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

  /**
   * Toggle the panel for a Session, or retarget an already open panel.
   * @param sessionId Current Harness Session id.
   * @param returnFocus Element restored after the panel closes.
   */
  toggle(sessionId: string | undefined, returnFocus?: HTMLElement): void {
    if (this.state.open && this.state.sessionId === sessionId) {
      this.close()
      return
    }
    if (returnFocus !== undefined) this.returnFocus = returnFocus
    this.state = sessionId === undefined
      ? { open: true, generation: ++this.generation }
      : { open: true, sessionId, generation: ++this.generation }
    this.notify()
  }

  /**
   * Follow a new globally selected Session while preserving the launch focus target.
   * @param sessionId Newly selected Harness Session id, if any.
   */
  retarget(sessionId: string | undefined): void {
    if (!this.state.open || this.state.sessionId === sessionId) return
    this.state = sessionId === undefined
      ? { open: true, generation: ++this.generation }
      : { open: true, sessionId, generation: ++this.generation }
    this.notify()
  }

  /** @param wide Whether the Harness sidebar currently shows its wide form. */
  reportSidebarWide(wide: boolean): void {
    this.sidebarWide = wide
  }

  /** Reveal the sidebar through its existing toggle action only when it is collapsed. */
  revealSidebar(): void {
    if (this.sidebarWide === false) this.toggleSidebar()
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
