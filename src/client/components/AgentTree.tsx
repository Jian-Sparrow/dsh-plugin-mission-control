import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentView } from '../../protocol.ts'
import type { NS } from '../locales.ts'

/** Render the Agent hierarchy as a compact, scrollable list. */
export function AgentTree({ agents, rootId, selectedAgentId, select, t }: {
  readonly agents: readonly AgentView[]
  readonly rootId: string
  readonly selectedAgentId: string | undefined
  readonly select: (id: string | undefined) => void
  readonly t: TranslateNS<typeof NS>
}): ReactNode {
  const rows = flattenAgents(agents, rootId)
  if (rows.length === 0) return <p className="mc-dashboard__empty">{t('graph.empty')}</p>
  return (
    <section className="mc-agent-tree" aria-label={t('graph.aria')}>
      <button type="button" className="mc-agent-tree__all" onClick={() => { select(undefined) }}>
        {t('graph.showAll')}
      </button>
      <div className="mc-agent-tree__rows">
        {rows.map(({ agent, depth }) => {
          const status = t(`status.${agent.status}`)
          return <button
            type="button"
            className={`mc-agent-row mc-agent-row--${agent.status}${agent.id === selectedAgentId ? ' mc-agent-row--selected' : ''}`}
            style={{ paddingInlineStart: 10 + depth * 14 }}
            aria-label={t('graph.selectAgent', { label: agent.label })}
            aria-pressed={agent.id === selectedAgentId}
            key={agent.id}
            onClick={() => { select(agent.id) }}
          >
            <span className="mc-agent-row__status" aria-label={t('graph.statusLabel', { status })} />
            <span className="mc-agent-row__copy"><strong>{agent.label}</strong><span>{status}</span></span>
          </button>
        })}
      </div>
    </section>
  )
}

function flattenAgents(agents: readonly AgentView[], rootId: string): Array<{ agent: AgentView; depth: number }> {
  const root = agents.find(agent => agent.id === rootId)
  if (root === undefined) return []
  const children = new Map<string, AgentView[]>()
  for (const agent of agents) {
    if (agent.parentId === undefined) continue
    const siblings = children.get(agent.parentId) ?? []
    siblings.push(agent)
    children.set(agent.parentId, siblings)
  }
  const rows: Array<{ agent: AgentView; depth: number }> = []
  const visit = (agent: AgentView, depth: number) => {
    rows.push({ agent, depth })
    const descendants = children.get(agent.id) ?? []
    descendants.sort((left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id))
    for (const child of descendants) visit(child, depth + 1)
  }
  visit(root, 0)
  return rows
}
