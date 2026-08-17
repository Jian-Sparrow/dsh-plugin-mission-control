/** Error raised when Harness no longer exposes the rc.7 sidebar structure. */
export class MissionControlSidebarHostError extends Error {
  /** Creates an actionable sidebar integration failure. */
  constructor(message: string) {
    super(`Mission Control sidebar host: ${message}`)
    this.name = 'MissionControlSidebarHostError'
  }
}

interface HostRecord {
  readonly element: HTMLDivElement
  references: number
}

const hosts = new WeakMap<HTMLElement, HostRecord>()

/**
 * Mounts a shared Mission Control panel host above the Harness rc.7 sidebar footer.
 * @param anchor Element rendered inside the `sidebar.footer.action` contribution.
 * @returns The shared host and an idempotent reference disposer.
 */
export function mountSidebarPanelHost(anchor: HTMLElement): {
  readonly element: HTMLDivElement
  dispose(): void
} {
  const outlet = anchor.closest<HTMLElement>('[data-slot="sidebar.footer.action"]')
  if (outlet === null) {
    throw new MissionControlSidebarHostError(
      'expected the rc.7 footer action outlet inside the final sidebar footer',
    )
  }
  const footerActions = outlet.parentElement
  const footer = footerActions === null ? null : footerActions.parentElement
  const sidebar = footer === null ? null : footer.parentElement
  const browsing = footer === null ? null : footer.previousElementSibling
  if (footerActions === null || footer === null || sidebar === null || browsing === null) {
    throw new MissionControlSidebarHostError(
      'expected the rc.7 footer action outlet inside the final sidebar footer',
    )
  }
  if (footer.nextElementSibling !== null) {
    throw new MissionControlSidebarHostError(
      'expected the rc.7 sidebar footer to be the final direct child',
    )
  }

  let record = hosts.get(footer)
  if (record === undefined || !record.element.isConnected) {
    const element = document.createElement('div')
    element.dataset.missionControlPanelHost = ''
    sidebar.insertBefore(element, footer)
    record = { element, references: 0 }
    hosts.set(footer, record)
  }
  record.references += 1

  let disposed = false
  return {
    element: record.element,
    dispose() {
      if (disposed) return
      disposed = true
      record.references -= 1
      if (record.references === 0) {
        record.element.remove()
        hosts.delete(footer)
      }
    },
  }
}
