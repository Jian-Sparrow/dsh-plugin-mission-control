// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionHeaderAction, MissionSidebarAction } from '../../src/client/Action.tsx'
import { MissionControlController } from '../../src/client/controller.ts'
import { apply, inject } from '../../src/client/index.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = (key: string) => ({
  'action.label': 'Mission Control',
  'action.open': 'Open Mission Control',
  'panel.expand': 'Expand Mission Control',
  'panel.restore': 'Restore Mission Control',
  'overlay.close': 'Close Mission Control',
  'overlay.connecting': 'Connecting',
}[key] ?? key)

describe('Mission Control browser registration', () => {
  it('contributes and disposes the two supported rc.7 surfaces', () => {
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
      layout: { toggleSidebar: vi.fn() },
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
    expect(entries.has('shell.overlay')).toBe(false)
    const styles = document.getElementById('dsh-mission-control-styles')?.textContent ?? ''
    expect(styles).toContain('.mc-panel--fullscreen{')
    expect(styles).toContain('.mc-dashboard__content--fullscreen{display:grid;grid-template-columns:')

    for (const dispose of disposers.reverse()) dispose()
    expect(entries.size).toBe(0)
  })

  it('portals below the Session list, follows the current Session, and cleans up', async () => {
    const toggleSidebar = vi.fn()
    const controller = new MissionControlController(toggleSidebar)
    const sources: Array<{ close: ReturnType<typeof vi.fn> }> = []
    const created = vi.fn((_url: string) => {
      const source = {
      onmessage: null,
      onerror: null,
      onopen: null,
      close: vi.fn(),
      }
      sources.push(source)
      return source
    })
    let current: string | undefined = 'mission-session'
    const useSessions = <Selected,>(selector: (value: {
      current?: string
      byId: Record<string, { displayTitle: string }>
    }) => Selected) => selector({
      ...(current === undefined ? {} : { current }),
      byId: { 'mission-session': { displayTitle: 'Mission' } },
    })

    const sidebarProps = {
      controller,
      createSource: created,
      settings: { previewMode: 'names-only', maxLiveRows: 20, velocityWindowMs: 5_000 },
      useSessions,
      wide: false,
      t,
    } as unknown as ComponentProps<typeof MissionSidebarAction>
    const fixture = createSidebar()
    const sidebar = render(<MissionSidebarAction {...sidebarProps} />, {
      container: fixture.outlet,
    })
    const page = within(document.body)
    expect(fixture.root.children[1]?.hasAttribute('data-mission-control-panel-host')).toBe(true)

    fireEvent.click(sidebar.getByRole('button', { name: 'Open Mission Control' }))
    expect(toggleSidebar).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="region"][aria-label="Mission Control"]')).toBeNull()

    sidebar.rerender(<MissionSidebarAction {...sidebarProps} wide />)
    const inline = document.querySelector('[role="region"][aria-label="Mission Control"]')
    expect(inline).toBeTruthy()
    expect(created).toHaveBeenCalledOnce()

    fireEvent.click(page.getByRole('button', { name: 'Expand Mission Control' }))
    expect(document.querySelector('[role="dialog"][aria-label="Mission Control"]')).toBeTruthy()
    expect(document.querySelector('[data-mission-control-panel-host]')?.children).toHaveLength(0)
    expect(created).toHaveBeenCalledOnce()

    fireEvent.click(page.getByRole('button', { name: 'Restore Mission Control' }))
    await act(async () => {})
    const expand = page.getByRole('button', { name: 'Expand Mission Control' })
    expect(document.querySelector('[role="region"][aria-label="Mission Control"]')).toBeTruthy()
    expect(document.activeElement).toBe(expand)
    expect(created).toHaveBeenCalledOnce()

    current = 'next-session'
    await act(async () => {
      sidebar.rerender(<MissionSidebarAction {...sidebarProps} wide />)
    })
    expect(sources[0]?.close).toHaveBeenCalledOnce()
    expect(created).toHaveBeenCalledTimes(2)
    expect(created.mock.calls[1]?.[0]).toContain('sessionId=next-session')

    fireEvent.click(page.getByRole('button', { name: 'Expand Mission Control' }))
    const dialog = page.getByRole('dialog', { name: 'Mission Control' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(sidebar.queryByRole('dialog', { name: 'Mission Control' })).toBeNull()
    expect(sources[1]?.close).toHaveBeenCalledOnce()

    fireEvent.click(sidebar.getByRole('button', { name: 'Open Mission Control' }))
    expect(created).toHaveBeenCalledTimes(3)
    fireEvent.click(page.getByRole('button', { name: 'Expand Mission Control' }))
    fireEvent.click(page.getByRole('button', { name: 'Close Mission Control' }))
    expect(sources[2]?.close).toHaveBeenCalledOnce()

    fireEvent.click(sidebar.getByRole('button', { name: 'Open Mission Control' }))
    expect(created).toHaveBeenCalledTimes(4)

    sidebar.rerender(<MissionSidebarAction {...sidebarProps} wide={false} />)
    expect(document.querySelector('[role="region"][aria-label="Mission Control"]')).toBeNull()
    expect(sources[3]?.close).toHaveBeenCalledOnce()

    sidebar.unmount()
    expect(document.querySelector('[data-mission-control-panel-host]')).toBeNull()
    expect(document.querySelector('[role="dialog"][aria-label="Mission Control"]')).toBeNull()
  })
})

function createSidebar() {
  const root = document.createElement('aside')
  const browsing = document.createElement('div')
  const footer = document.createElement('div')
  const footerActions = document.createElement('div')
  const outlet = document.createElement('div')
  outlet.dataset.slot = 'sidebar.footer.action'
  const settings = document.createElement('div')
  footerActions.append(outlet)
  footer.append(footerActions, settings)
  root.append(browsing, footer)
  document.body.append(root)
  return { root, outlet }
}
