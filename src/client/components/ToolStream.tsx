import { useEffect, useRef, type ReactNode, type UIEvent } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PreviewMode } from '../../config.ts'
import type { AgentView, ToolView } from '../../protocol.ts'
import type { MissionStore } from '../store.ts'
import type { NS } from '../locales.ts'

/** Append-only live Tool stream with tail-follow control. */
export function ToolStream({ tools, agents, previewMode, following, store, now, t }: {
  readonly tools: readonly ToolView[]
  readonly agents: readonly AgentView[]
  readonly previewMode: PreviewMode
  readonly following: boolean
  readonly store: MissionStore
  readonly now: () => number
  readonly t: TranslateNS<typeof NS>
}): ReactNode {
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const log = logRef.current
    if (following && log !== null) log.scrollTop = log.scrollHeight - log.clientHeight
  }, [following, tools])
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget
    store.setFollowingTools(node.scrollHeight - node.clientHeight - node.scrollTop <= 24)
  }
  const returnToLive = () => {
    const log = logRef.current
    if (log !== null) log.scrollTop = log.scrollHeight - log.clientHeight
    store.setFollowingTools(true)
  }
  const labels = new Map(agents.map(agent => [agent.id, agent.label]))
  return (
    <aside className="mc-tools" aria-label={t('tools.panel')}>
      <header><strong>{t('tools.title')}</strong><span>{tools.length}</span></header>
      <div className="mc-tools__log" role="log" aria-label={t('tools.aria')} ref={logRef} onScroll={onScroll}>
        {tools.length === 0 ? <p className="mc-tools__empty">{t('tools.empty')}</p> : tools.map(tool => (
          <article className={`mc-tool mc-tool--${tool.status}`} key={tool.key}>
            <div className="mc-tool__head"><strong>{tool.name}</strong><span>{t(`toolStatus.${tool.status}`)}</span></div>
            <div className="mc-tool__meta">
              <span>{t('tools.owner')}: {labels.get(tool.sessionId) ?? tool.sessionId}</span>
              <span>{elapsed(tool, now())}</span>
            </div>
            <Preview tool={tool} mode={previewMode} t={t} />
          </article>
        ))}
      </div>
      {following ? null : <button type="button" className="mc-tools__return" onClick={returnToLive}>{t('tools.return')}</button>}
    </aside>
  )
}

function Preview({ tool, mode, t }: {
  readonly tool: ToolView
  readonly mode: PreviewMode
  readonly t: TranslateNS<typeof NS>
}): ReactNode {
  if (mode === 'names-only') return null
  const values = [tool.argumentsPreview, tool.resultPreview].filter((value): value is string => value !== undefined)
  if (values.length === 0) return null
  return <div className="mc-tool__preview">
    {mode === 'redacted' ? <small>{t('tools.redacted')}</small> : null}
    {values.map((value, index) => <pre key={index}>{value}</pre>)}
  </div>
}

function elapsed(tool: ToolView, now: number): string {
  const finish = tool.finishedAt ?? now
  return `${Math.max(0, finish - tool.startedAt)}ms`
}
