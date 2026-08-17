import { hierarchy, tree } from 'd3-hierarchy'
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentView } from '../../protocol.ts'
import type { NS } from '../locales.ts'
import { AgentNode } from './AgentNode.tsx'

interface AgentTreeNode {
  readonly agent: AgentView
  readonly children: readonly AgentTreeNode[]
}

/** Render a stable left-to-right topology with an accessible HTML node layer. */
export function AgentGraph({ agents, rootId, selectedAgentId, select, t }: {
  readonly agents: readonly AgentView[]
  readonly rootId: string
  readonly selectedAgentId: string | undefined
  readonly select: (id: string | undefined) => void
  readonly t: TranslateNS<typeof NS>
}): ReactNode {
  const root = buildTree(agents, rootId)
  if (root === undefined) return <p>{t('graph.empty')}</p>
  const layout = tree<AgentTreeNode>().nodeSize([112, 224])(
    hierarchy(root, item => item.children),
  )
  const nodes = layout.descendants()
  const minimumX = Math.min(...nodes.map(node => node.x))
  const offsetX = 48 - minimumX
  const width = Math.max(520, Math.max(...nodes.map(node => node.y)) + 240)
  const height = Math.max(320, Math.max(...nodes.map(node => node.x + offsetX)) + 120)
  return (
    <section className="mc-graph" aria-label={t('graph.aria')}>
      <button type="button" className="mc-graph__clear" onClick={() => { select(undefined) }}>
        {t('graph.showAll')}
      </button>
      <div className="mc-graph__canvas" style={{ width, height }}>
        <svg className="mc-graph__edges" width={width} height={height} aria-hidden="true">
          {layout.links().map(link => {
            const sourceX = link.source.x + offsetX + 31
            const targetX = link.target.x + offsetX + 31
            const middleY = (link.source.y + link.target.y) / 2 + 170
            return <path
              key={`${link.source.data.agent.id}:${link.target.data.agent.id}`}
              data-testid="agent-edge"
              d={`M ${link.source.y + 176} ${sourceX} C ${middleY} ${sourceX}, ${middleY} ${targetX}, ${link.target.y} ${targetX}`}
            />
          })}
        </svg>
        {nodes.map(node => <AgentNode
          key={node.data.agent.id}
          agent={node.data.agent}
          selected={node.data.agent.id === selectedAgentId}
          x={node.x + offsetX}
          y={node.y}
          select={select}
          t={t}
        />)}
      </div>
    </section>
  )
}

function buildTree(agents: readonly AgentView[], rootId: string): AgentTreeNode | undefined {
  const byParent = new Map<string, AgentView[]>()
  for (const agent of agents) {
    if (agent.parentId === undefined) continue
    const siblings = byParent.get(agent.parentId) ?? []
    siblings.push(agent)
    byParent.set(agent.parentId, siblings)
  }
  const visit = (agent: AgentView): AgentTreeNode => ({
    agent,
    children: [...(byParent.get(agent.id) ?? [])]
      .sort((left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id))
      .map(visit),
  })
  const root = agents.find(agent => agent.id === rootId)
  return root === undefined ? undefined : visit(root)
}
