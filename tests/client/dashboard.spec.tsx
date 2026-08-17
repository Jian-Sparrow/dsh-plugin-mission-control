// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MissionControlController } from '../../src/client/controller.ts'
import { MissionDashboard } from '../../src/client/components/MissionDashboard.tsx'
import { MissionStore } from '../../src/client/store.ts'
import type { MissionSnapshot } from '../../src/protocol.ts'
import { DEEPSEEK_PRICING } from '../../src/pricing.ts'
import type { CostBreakdown, CostEstimate } from '../../src/host/cost.ts'

const snapshot: MissionSnapshot = {
  rootId: 'root',
  agents: [
    agent('root', 'Root agent', 10, undefined, 'responding'),
    agent('child-a', 'Researcher', 4, 'root', 'tool'),
    agent('child-b', 'Writer', 6, 'root', 'error'),
  ],
  tools: [
    {
      key: 'child-a:call-1', sessionId: 'child-a', callId: 'call-1', name: 'web_search',
      startedAt: 1_000, status: 'running', argumentsPreview: '{"query":"mission control"}',
    },
    {
      key: 'root:call-2', sessionId: 'root', callId: 'call-2', name: 'read_file',
      startedAt: 500, finishedAt: 900, status: 'success', resultPreview: 'README.md',
    },
  ],
  totals: { uncachedInputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 2 },
  cost: zeroCost(),
  pricing: DEEPSEEK_PRICING.metadata,
  diagnostics: 1,
}

afterEach(cleanup)

describe('MissionDashboard', () => {
  it('shows Agent topology and Tool stream together in full-screen mode', () => {
    const { props } = bench('full')
    const view = render(<MissionDashboard {...props} presentation="fullscreen" />)

    expect(view.getByLabelText('Agent topology')).toBeTruthy()
    expect(view.getAllByTestId('agent-edge')).toHaveLength(2)
    expect(view.getByRole('log', { name: 'Live tool stream' })).toBeTruthy()
    expect(view.queryByRole('tablist')).toBeNull()
  })

  it('starts on Agents, switches to Tools, and preserves Agent filtering', () => {
    const { store, controller, props } = bench()
    const view = render(<MissionDashboard {...props} />)

    expect(view.getByText('20')).toBeTruthy()
    expect(view.getByText('3 agents')).toBeTruthy()
    expect(view.getByText('1 running tool')).toBeTruthy()
    expect(view.getByLabelText('Error status')).toBeTruthy()
    expect(view.getByText('Researcher')).toBeTruthy()
    expect(view.getByRole('tab', { name: 'Agents' }).getAttribute('aria-selected')).toBe('true')
    expect(view.queryByText('web_search')).toBeNull()

    fireEvent.click(view.getByRole('button', { name: 'Select Researcher' }))
    expect(store.getSnapshot().selectedAgentId).toBe('child-a')
    fireEvent.click(view.getByRole('tab', { name: 'Tools' }))
    expect(view.getByText('web_search')).toBeTruthy()
    expect(view.queryByText('read_file')).toBeNull()
    expect(view.getByText('1 agent')).toBeTruthy()

    fireEvent.click(view.getByRole('tab', { name: 'Agents' }))
    fireEvent.click(view.getByRole('button', { name: 'Show all agents' }))
    expect(store.getSnapshot().selectedAgentId).toBeUndefined()
    fireEvent.click(view.getByRole('tab', { name: 'Tools' }))
    expect(view.getByText('read_file')).toBeTruthy()

    fireEvent.click(view.getByRole('tab', { name: 'Agents' }))
    fireEvent.keyDown(view.getByRole('button', { name: 'Select Writer' }), { key: 'Enter' })
    fireEvent.click(view.getByRole('button', { name: 'Select Writer' }))
    expect(store.getSnapshot().selectedAgentId).toBe('child-b')

    fireEvent.keyDown(view.getByRole('region', { name: 'Mission dashboard' }), { key: 'Escape' })
    expect(controller.getSnapshot()).toEqual({ open: false })
  })

  it('suspends Tool auto-follow on upward scroll and restores the live tail', () => {
    const { props, store } = bench()
    const view = render(<MissionDashboard {...props} />)
    fireEvent.click(view.getByRole('tab', { name: 'Tools' }))
    const stream = view.getByRole('log', { name: 'Live tool stream' })
    Object.defineProperties(stream, {
      scrollHeight: { configurable: true, value: 500 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    })
    fireEvent.scroll(stream)
    expect(store.getSnapshot().followingTools).toBe(false)
    const returnButton = view.getByRole('button', { name: 'Return to live' })
    fireEvent.click(returnButton)
    expect(store.getSnapshot().followingTools).toBe(true)
    expect(stream.scrollTop).toBe(300)
  })

  it('marks full previews with a persistent privacy warning', () => {
    const { props } = bench('full')
    const view = render(<MissionDashboard {...props} />)
    expect(view.getByRole('status').textContent).toContain('Full tool payloads are visible')
    fireEvent.click(view.getByRole('tab', { name: 'Tools' }))
    expect(within(view.getByRole('log')).getByText('{"query":"mission control"}')).toBeTruthy()
  })

  it('renders a complete CNY estimate with source details', () => {
    const complete: CostEstimate = {
      ...zeroCost(),
      usd: 0.14,
      cny: 0.950516,
      pricedSteps: 1,
      breakdown: [flashBreakdown],
    }
    const { props } = bench('full', { ...snapshot, cost: complete })
    const view = render(<MissionDashboard {...props} />)

    expect(view.getByText('≈ ¥0.950516')).toBeTruthy()
    expect(view.getByText('Estimate only, not an actual bill')).toBeTruthy()
    expect(view.getByText('$0.140000')).toBeTruthy()
    expect(view.getByText(/1 USD = 6.7894 CNY/)).toBeTruthy()
    expect(view.getByText(/2026-08-17/)).toBeTruthy()
    expect(view.getByText(/2026-07-31/)).toBeTruthy()
  })

  it('labels a partial estimate and reports excluded model steps', () => {
    const partial: CostEstimate = {
      ...zeroCost(),
      usd: 0.14,
      cny: 0.950516,
      pricedSteps: 1,
      unpricedSteps: 2,
      breakdown: [flashBreakdown],
    }
    const { props } = bench('full', { ...snapshot, cost: partial })
    const view = render(<MissionDashboard {...props} />)

    expect(view.getByText('Partial estimate')).toBeTruthy()
    expect(view.getByText('2 model steps excluded')).toBeTruthy()
  })

  it('shows no price when every observed model step is unpriced', () => {
    const unavailable: CostEstimate = { ...zeroCost(), unpricedSteps: 1 }
    const { props } = bench('full', { ...snapshot, cost: unavailable })
    const view = render(<MissionDashboard {...props} />)

    expect(view.getByText('No price')).toBeTruthy()
  })
})

function bench(
  previewMode: 'names-only' | 'redacted' | 'full' = 'full',
  mission: MissionSnapshot = snapshot,
) {
  const store = new MissionStore({ generation: 1, maxLiveRows: 20, velocityWindowMs: 5_000 })
  store.receive({ type: 'snapshot', subscriptionId: 'sub', generation: 1, snapshot: mission })
  store.setConnection('reconnecting')
  const controller = new MissionControlController()
  controller.open('root')
  const props = {
    store,
    controller,
    sessionTitle: 'Current mission',
    previewMode,
    presentation: 'inline',
    now: () => 2_000,
    t: translate,
  } as ComponentProps<typeof MissionDashboard>
  return { store, controller, props }
}

function translate(key: string, params?: Record<string, unknown>): string {
  const value = ({
    'dashboard.aria': 'Mission dashboard',
    'tabs.agents': 'Agents',
    'tabs.tools': 'Tools',
    'connection.reconnecting': 'Reconnecting',
    'hud.aria': 'Mission status',
    'hud.total': 'Total tokens',
    'hud.input': 'Input',
    'hud.output': 'Output',
    'hud.cacheRead': 'Cache read',
    'hud.cacheWrite': 'Cache write',
    'hud.rate': 'Recent tokens',
    'hud.estimatedCost': 'Estimated cost',
    'hud.estimate': 'Estimate',
    'hud.partialEstimate': 'Partial estimate',
    'hud.noPrice': 'No price',
    'hud.costDetails': 'Cost estimate details',
    'hud.notBill': 'Estimate only, not an actual bill',
    'hud.usdSubtotal': 'USD subtotal',
    'hud.exchangeRate': 'Reference rate: 1 USD = {rate} CNY',
    'hud.priceCheckedAt': 'Prices checked {date}',
    'hud.fxEffectiveAt': 'Reference rate effective {date}',
    'hud.unpricedSteps': '{count} model steps excluded',
    'hud.modelPrice': '{model} unit prices',
    'hud.agent': '{count} agent',
    'hud.agents': '{count} agents',
    'hud.runningTool': '{count} running tool',
    'hud.runningTools': '{count} running tools',
    'hud.diagnostics': '{count} diagnostics',
    'hud.fullWarning': 'Full tool payloads are visible',
    'graph.aria': 'Agent topology',
    'graph.showAll': 'Show all agents',
    'graph.selectAgent': 'Select {label}',
    'graph.statusLabel': '{status} status',
    'status.responding': 'Responding',
    'status.tool': 'Using tool',
    'status.error': 'Error',
    'tools.panel': 'Tool activity',
    'tools.title': 'Tool stream',
    'tools.aria': 'Live tool stream',
    'tools.owner': 'Agent',
    'tools.return': 'Return to live',
    'toolStatus.running': 'Running',
    'toolStatus.success': 'Success',
  } as Record<string, string>)[key] ?? key
  return Object.entries(params ?? {}).reduce(
    (result, [name, replacement]) => result.replace(`{${name}}`, String(replacement)),
    value,
  )
}

function agent(
  id: string,
  label: string,
  tokenValue: number,
  parentId: string | undefined,
  status: 'responding' | 'tool' | 'error',
) {
  return {
    id,
    ...(parentId === undefined ? {} : { parentId }),
    label,
    local: true,
    startedAt: id === 'root' ? 0 : id === 'child-a' ? 1 : 2,
    status,
    tokens: {
      uncachedInputTokens: tokenValue,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    cost: zeroCost(),
  }
}

function zeroCost() {
  return { usd: 0, cny: 0, pricedSteps: 0, unpricedSteps: 0, breakdown: [] }
}

const flashBreakdown: CostBreakdown = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  price: {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    cacheHitUsdPerMillion: 0.0028,
    cacheMissUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
    cacheWriteUsdPerMillion: 0,
  },
  tokens: {
    uncachedInputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  usd: 0.14,
  cny: 0.950516,
}
