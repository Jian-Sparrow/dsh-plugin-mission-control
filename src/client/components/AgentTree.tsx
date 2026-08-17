import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentView } from '../../protocol.ts'
import type { NS } from '../locales.ts'

/** Render the live Agent hierarchy as a compact selectable list. */
export function AgentTree({ agents, rootId, selectedAgentId, select, t }: {
  readonly agents: readonly AgentView[]
  readonly rootId: string
  readonly selectedAgentId: string | undefined
  readonly select: (id: string | undefined) => void
  readonly t: TranslateNS<typeof NS>
}): ReactNode {
  const rows = flattenAgents(agents, rootId)
  if (rows.length === 0) return <p>{t('graph.empty')}</p>
  return (
    <section className="mc-agents" aria-label={t('graph.aria')}>
      <button type="button" className="mc-agents__all" onClick={() => { select(undefined) }}>
        {t('graph.showAll')}
      </button>
      <div className="mc-agents__list">
        {rows.map(({ agent, depth }) => {
          const status = t(`status.${agent.status}`)
          return (
            <button
              key={agent.id}
              type="button"
              className={`mc-agent-row mc-agent-row--${agent.status}${selectedAgentId === agent.id ? ' mc-agent-row--selected' : ''}`}
              style={{ paddingInlineStart: 12 + depth * 18 }}
              aria-label={t('graph.selectAgent', { label: agent.label })}
              aria-pressed={selectedAgentId === agent.id}
              onClick={() => { select(agent.id) }}
            >
              <span className="mc-agent-row__branch" aria-hidden="true">{depth === 0 ? '●' : '└'}</span>
              <span className="mc-agent-row__copy"><strong>{agent.label}</strong><small>{status}</small></span>
              <span className="mc-agent-row__status" aria-label={t('graph.statusLabel', { status })}>
                {statusIcon(agent.status)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function flattenAgents(agents: readonly AgentView[], rootId: string): Array<{
  readonly agent: AgentView
  readonly depth: number
}> {
  const byParent = new Map<string, AgentView[]>()
  for (const agent of agents) {
    if (agent.parentId === undefined) continue
    const children = byParent.get(agent.parentId) ?? []
    children.push(agent)
    byParent.set(agent.parentId, children)
  }
  const rows: Array<{ agent: AgentView; depth: number }> = []
  const visit = (agent: AgentView, depth: number) => {
    rows.push({ agent, depth })
    const children = [...(byParent.get(agent.id) ?? [])]
      .sort((left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id))
    for (const child of children) visit(child, depth + 1)
  }
  const root = agents.find(agent => agent.id === rootId)
  if (root !== undefined) visit(root, 0)
  return rows
}

function statusIcon(status: AgentView['status']): string {
  switch (status) {
    case 'idle': return '○'
    case 'responding': return '◉'
    case 'tool': return '◆'
    case 'waiting-child': return '◇'
    case 'completed': return '✓'
    case 'error': return '!'
    case 'cancelled': return '×'
    case 'unavailable': return '?'
  }
}
