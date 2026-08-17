import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentView } from '../../protocol.ts'
import type { NS } from '../locales.ts'

/** One accessible Agent topology button. */
export function AgentNode({ agent, selected, x, y, select, t }: {
  readonly agent: AgentView
  readonly selected: boolean
  readonly x: number
  readonly y: number
  readonly select: (id: string) => void
  readonly t: TranslateNS<typeof NS>
}): ReactNode {
  const status = t(`status.${agent.status}`)
  return (
    <button
      type="button"
      className={`mc-agent mc-agent--${agent.status}${selected ? ' mc-agent--selected' : ''}`}
      style={{ left: y, top: x }}
      aria-label={t('graph.selectAgent', { label: agent.label })}
      aria-pressed={selected}
      onClick={() => { select(agent.id) }}
    >
      <span className="mc-agent__icon" aria-label={t('graph.statusLabel', { status })}>
        {statusIcon(agent.status)}
      </span>
      <span className="mc-agent__copy"><strong>{agent.label}</strong><span>{status}</span></span>
    </button>
  )
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
