import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { MissionControlController } from './controller.ts'
import { MissionSource, type EventSourceFactory } from './source.ts'
import { MissionStore } from './store.ts'
import type { NS } from './locales.ts'
import type { ResolvedConfig } from '../config.ts'
import { MissionDashboard } from './components/MissionDashboard.tsx'

/** Browser resources injected into the global overlay contribution. */
export interface MissionOverlayInjected {
  readonly controller: MissionControlController
  readonly createSource?: EventSourceFactory
  readonly settings: Pick<ResolvedConfig, 'previewMode' | 'maxLiveRows' | 'velocityWindowMs'>
}

type OverlayProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS> & MissionOverlayInjected

/** Persistent global seat that renders only while the controller is open. */
export function MissionControlOverlay(props: OverlayProps): ReactNode {
  const { controller, useSessions } = props
  const state = useSyncExternalStore(
    listener => controller.subscribe(listener),
    () => controller.getSnapshot(),
  )
  const currentSessionId = useSessions(value => value.current)

  useEffect(() => {
    if (state.open && String(currentSessionId ?? '') !== state.sessionId) controller.close()
  }, [controller, currentSessionId, state])

  if (!state.open) return null
  return <LiveMission {...props} sessionId={state.sessionId} generation={state.generation} />
}

function LiveMission({ controller, createSource, settings, sessionId, generation, t, useSessions }: OverlayProps & {
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

  return (
    <section className="mc-overlay" role="dialog" aria-modal="true" aria-label={t('action.label')}>
      <header className="mc-overlay__topbar">
        <div className="mc-overlay__brand">
          <span aria-hidden="true">◎</span>
          <span>{t('action.label')}</span>
          <span className="mc-overlay__live">LIVE</span>
        </div>
        <button
          type="button"
          className="mc-overlay__close"
          aria-label={t('overlay.close')}
          onClick={() => { controller.close() }}
        >×</button>
      </header>
      <main className="mc-overlay__body">
        <MissionDashboard
          store={store}
          controller={controller}
          sessionTitle={useSessions(state => state.byId[sessionId as keyof typeof state.byId]?.displayTitle ?? sessionId)}
          previewMode={settings.previewMode}
          t={t}
        />
      </main>
    </section>
  )
}
