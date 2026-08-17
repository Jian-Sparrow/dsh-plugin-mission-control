// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { mountSidebarPanelHost } from '../../src/client/sidebar-host.ts'

describe('mountSidebarPanelHost', () => {
  it('inserts one shared panel host between the browsing region and footer', () => {
    const { root, browsing, action } = createSidebar()

    const first = mountSidebarPanelHost(action)
    const second = mountSidebarPanelHost(action)

    expect(first.element).toBe(second.element)
    expect(root.children).toEqual(expect.objectContaining({
      0: browsing,
      1: first.element,
    }))
    expect(first.element.nextElementSibling?.className).toBe('footer')

    first.dispose()
    expect(first.element.isConnected).toBe(true)
    second.dispose()
    expect(first.element.isConnected).toBe(false)
  })

  it('rejects anchors outside the rc.7 sidebar footer structure', () => {
    const anchor = document.createElement('button')
    document.body.append(anchor)

    expect(() => mountSidebarPanelHost(anchor)).toThrowError(
      /Mission Control sidebar host/,
    )
  })
})

function createSidebar() {
  const root = document.createElement('aside')
  const browsing = document.createElement('div')
  browsing.className = 'browsing'
  const footer = document.createElement('div')
  footer.className = 'footer'
  const footerActions = document.createElement('div')
  const outlet = document.createElement('div')
  outlet.dataset.slot = 'sidebar.footer.action'
  const action = document.createElement('button')
  const settings = document.createElement('div')
  settings.dataset.slot = 'settings'

  outlet.append(action)
  footerActions.append(outlet)
  footer.append(footerActions, settings)
  root.append(browsing, footer)
  document.body.append(root)
  return { root, browsing, action }
}
