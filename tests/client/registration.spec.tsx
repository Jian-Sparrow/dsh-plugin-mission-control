// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionHeaderAction, MissionSidebarAction } from '../../src/client/Action.tsx'
import { MissionControlController } from '../../src/client/controller.ts'
import { apply, inject } from '../../src/client/index.ts'
import { MissionControlOverlay } from '../../src/client/Overlay.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = (key: string) => ({
  'action.label': 'Mission Control',
  'action.open': 'Open Mission Control',
  'overlay.close': 'Close Mission Control',
  'overlay.connecting': 'Connecting',
}[key] ?? key)

describe('Mission Control browser registration', () => {
  it('contributes and disposes all three DSH Web surfaces', () => {
    const entries = new Map<string, { id: string | undefined; component: unknown }>()
    const disposers: Array<() => void> = []
    const ctx = {
      provide: vi.fn(),
      effect: (setup: () => void | (() => void)) => {
        const dispose = setup()
        if (typeof dispose === 'function') disposers.push(dispose)
        return () => {}
      },
      locale: { register: () => () => {} },
      slots: {
        inject: (_name: string, setup: () => () => void) => {
          disposers.push(setup())
          return () => {}
        },
        register: (
          options: { name: string; id?: string },
          component: unknown,
        ) => {
          entries.set(options.name, { id: options.id, component })
          return () => { entries.delete(options.name) }
        },
      },
    }

    apply(ctx as never)
    expect(inject).toEqual(['sessions', 'slots', 'locale'])
    expect(entries.get('conversation.session.header.actions')).toEqual({
      id: 'mission-control-header', component: MissionHeaderAction,
    })
    expect(entries.get('sidebar.footer.action')).toEqual({
      id: 'mission-control-sidebar', component: MissionSidebarAction,
    })
    expect(entries.get('shell.overlay')).toEqual({
      id: 'mission-control-overlay', component: MissionControlOverlay,
    })

    for (const dispose of disposers.reverse()) dispose()
    expect(entries.size).toBe(0)
  })

  it('opens the bound Session, streams once, closes, and disables without a current Session', () => {
    const controller = new MissionControlController()
    const created = vi.fn(() => ({
      onmessage: null,
      onerror: null,
      onopen: null,
      close: vi.fn(),
    }))
    let current: string | undefined = 'mission-session'
    const useSessions = <Selected,>(selector: (value: {
      current?: string
      byId: Record<string, { displayTitle: string }>
    }) => Selected) => selector({
      ...(current === undefined ? {} : { current }),
      byId: { 'mission-session': { displayTitle: 'Mission' } },
    })

    const headerProps = {
      controller,
      sessionId: 'mission-session',
      t,
      useSessions,
    } as unknown as ComponentProps<typeof MissionHeaderAction>
    const header = render(<MissionHeaderAction {...headerProps} />)
    fireEvent.click(header.getByRole('button', { name: 'Open Mission Control' }))

    const overlayProps = {
      controller,
      createSource: created,
      settings: { previewMode: 'names-only', maxLiveRows: 20, velocityWindowMs: 5_000 },
      useSessions,
      t,
    } as unknown as ComponentProps<typeof MissionControlOverlay>
    const overlay = render(<MissionControlOverlay {...overlayProps} />)
    expect(overlay.getByRole('dialog', { name: 'Mission Control' })).toBeTruthy()
    expect(created).toHaveBeenCalledOnce()
    fireEvent.click(overlay.getByRole('button', { name: 'Close Mission Control' }))
    expect(overlay.queryByRole('dialog')).toBeNull()

    current = undefined
    const sidebarProps = {
      controller,
      useSessions,
      wide: true,
      t,
    } as unknown as ComponentProps<typeof MissionSidebarAction>
    const sidebar = render(<MissionSidebarAction {...sidebarProps} />)
    expect(sidebar.container.querySelector('button')?.hasAttribute('disabled'))
      .toBe(true)
  })
})
