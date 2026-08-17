import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './sidebar-auxiliary-contract.ts'
import type { MissionControlController } from './controller.ts'
import { MissionSource, type EventSourceFactory } from './source.ts'
import { MissionStore } from './store.ts'
import type { NS } from './locales.ts'
import type { ResolvedConfig } from '../config.ts'
import { MissionDashboard } from './components/MissionDashboard.tsx'

/** Browser resources injected into the sidebar panel contribution. */
export interface MissionPanelInjected {
  readonly controller: MissionControlController
  readonly createSource?: EventSourceFactory
  readonly settings: Pick<ResolvedConfig, 'previewMode' | 'maxLiveRows' | 'velocityWindowMs'>
}

type PanelProps = PropsRuntime<'sidebar.auxiliary'>
  & PropsLocale<typeof NS> & MissionPanelInjected

/** Render the current Session's live telemetry inside the wide sidebar. */
export function MissionControlPanel(props: PanelProps): ReactNode {
  const { controller, useSessions, wide, t } = props
  const state = useSyncExternalStore(
    listener => controller.subscribe(listener),
    () => controller.getSnapshot(),
  )
  const selected = useSessions(value => value.current)
  const currentSessionId = selected === undefined ? undefined : String(selected)

  useEffect(() => {
    if (state.open) controller.retarget(currentSessionId)
  }, [controller, currentSessionId, state.open])

  if (!state.open || !wide) return null
  return (
    <section className="mc-panel" role="region" aria-label={t('action.label')}>
      <header className="mc-panel__header">
        <div className="mc-panel__brand">
          <span aria-hidden="true">◎</span>
          <strong>{t('action.label')}</strong>
          <span className="mc-panel__live">LIVE</span>
        </div>
        <button type="button" className="mc-panel__close" aria-label={t('panel.close')} onClick={() => { controller.close() }}>×</button>
      </header>
      {state.sessionId === undefined
        ? <p className="mc-panel__idle">{t('panel.noSession')}</p>
        : <LiveMission {...props} sessionId={state.sessionId} generation={state.generation} />}
    </section>
  )
}

function LiveMission({ createSource, settings, sessionId, generation, t, useSessions, controller }: PanelProps & {
  readonly sessionId: string
  readonly generation: number
}): ReactNode {
  const store = useMemo(() => new MissionStore({
    generation,
    maxLiveRows: settings.maxLiveRows,
    velocityWindowMs: settings.velocityWindowMs,
  }), [generation, settings.maxLiveRows, settings.velocityWindowMs])
  const source = useMemo(() => new MissionSource(store, createSource), [createSource, store])

  useEffect(() => {
    source.open(sessionId, generation)
    return () => { source.close() }
  }, [generation, sessionId, source])

  const sessionTitle = useSessions(state => state.byId[sessionId as keyof typeof state.byId]?.displayTitle ?? sessionId)
  return <MissionDashboard
    store={store}
    controller={controller}
    sessionTitle={sessionTitle}
    previewMode={settings.previewMode}
    t={t}
  />
}
