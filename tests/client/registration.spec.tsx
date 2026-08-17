// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionHeaderAction, MissionSidebarAction } from '../../src/client/Action.tsx'
import { MissionControlController } from '../../src/client/controller.ts'
import { apply, inject } from '../../src/client/index.ts'
import { MissionControlPanel } from '../../src/client/Panel.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = (key: string) => ({
  'action.label': 'Mission Control',
  'action.open': 'Open Mission Control',
  'panel.close': 'Close Mission Control',
  'panel.connecting': 'Connecting',
}[key] ?? key)

describe('Mission Control browser registration', () => {
  it('contributes and disposes the two actions plus the sidebar panel', () => {
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
      layout: { openSidebar: vi.fn() },
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
    expect(inject).toEqual(['sessions', 'slots', 'locale', 'layout'])
    expect(entries.get('conversation.session.header.actions')).toEqual({
      id: 'mission-control-header', component: MissionHeaderAction,
    })
    expect(entries.get('sidebar.footer.action')).toEqual({
      id: 'mission-control-sidebar', component: MissionSidebarAction,
    })
    expect(entries.get('sidebar.auxiliary')).toEqual({
      id: undefined, component: MissionControlPanel,
    })

    for (const dispose of disposers.reverse()) dispose()
    expect(entries.size).toBe(0)
  })

  it('reveals the sidebar, streams the current Session, retargets, and hides in rail mode', () => {
    const controller = new MissionControlController()
    const created = vi.fn(() => ({
      onmessage: null,
      onerror: null,
      onopen: null,
      close: vi.fn(),
    }))
    let current: string | undefined = 'mission-session'
    const openSidebar = vi.fn()
    const useSessions = <Selected,>(selector: (value: {
      current?: string
      byId: Record<string, { displayTitle: string }>
    }) => Selected) => selector({
      ...(current === undefined ? {} : { current }),
      byId: { 'mission-session': { displayTitle: 'Mission' } },
    })

    const headerProps = {
      controller,
      openSidebar,
      sessionId: 'mission-session',
      t,
      useSessions,
    } as unknown as ComponentProps<typeof MissionHeaderAction>
    const header = render(<MissionHeaderAction {...headerProps} />)
    fireEvent.click(header.getByRole('button', { name: 'Open Mission Control' }))
    expect(openSidebar).toHaveBeenCalledOnce()

    const panelProps = {
      controller,
      createSource: created,
      settings: { previewMode: 'names-only', maxLiveRows: 20, velocityWindowMs: 5_000 },
      useSessions,
      wide: true,
      t,
    } as unknown as ComponentProps<typeof MissionControlPanel>
    const panel = render(<MissionControlPanel {...panelProps} />)
    expect(panel.getByRole('region', { name: 'Mission Control' })).toBeTruthy()
    expect(created).toHaveBeenCalledOnce()

    current = undefined
    panel.rerender(<MissionControlPanel {...panelProps} />)
    expect(controller.getSnapshot()).toMatchObject({ open: true, sessionId: undefined })
    expect(created.mock.results[0]?.value.close).toHaveBeenCalledOnce()

    panel.rerender(<MissionControlPanel {...panelProps} wide={false} />)
    expect(panel.queryByRole('region', { name: 'Mission Control' })).toBeNull()

    const sidebarProps = {
      controller,
      openSidebar,
      useSessions,
      wide: true,
      t,
    } as unknown as ComponentProps<typeof MissionSidebarAction>
    const sidebar = render(<MissionSidebarAction {...sidebarProps} />)
    const sidebarButton = sidebar.container.querySelector('button')
    if (sidebarButton === null) throw new Error('sidebar action missing')
    fireEvent.click(sidebarButton)
    expect(openSidebar).toHaveBeenCalledTimes(2)
  })
})
