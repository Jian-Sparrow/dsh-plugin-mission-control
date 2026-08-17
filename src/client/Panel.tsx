import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ResolvedConfig } from '../config.ts'
import { MissionDashboard } from './components/MissionDashboard.tsx'
import type { MissionControlController } from './controller.ts'
import type { NS } from './locales.ts'
import { MissionSource, type EventSourceFactory } from './source.ts'
import { MissionStore } from './store.ts'

/** Resources required by the inline Mission Control panel. */
export interface MissionPanelInjected {
  readonly controller: MissionControlController
  readonly createSource?: EventSourceFactory
  readonly settings: Pick<ResolvedConfig, 'previewMode' | 'maxLiveRows' | 'velocityWindowMs'>
}

type PanelProps = Pick<PropsRuntime<'sidebar.footer.action'>, 'useSessions' | 'wide'>
  & PropsLocale<typeof NS> & MissionPanelInjected

/** Live panel rendered into the plugin-owned sidebar host. */
export function MissionControlPanel(props: PanelProps): ReactNode {
  const { controller, useSessions, wide } = props
  const state = useSyncExternalStore(
    listener => controller.subscribe(listener),
    () => controller.getSnapshot(),
  )
  const currentSessionId = useSessions(value => value.current)

  useEffect(() => {
    if (state.open) {
      controller.retarget(
        currentSessionId === undefined ? undefined : String(currentSessionId),
      )
    }
  }, [controller, currentSessionId, state.open])

  if (!state.open || !wide) return null
  if (state.sessionId === undefined) {
    return <PanelFrame controller={controller} t={props.t} />
  }
  return <LiveMission {...props} sessionId={state.sessionId} generation={state.generation} />
}

function LiveMission({
  controller, createSource, settings, sessionId, generation, t, useSessions,
}: PanelProps & { readonly sessionId: string; readonly generation: number }): ReactNode {
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
    <PanelFrame controller={controller} t={t}>
      <MissionDashboard
        store={store}
        controller={controller}
        sessionTitle={useSessions(state => state.byId[sessionId as keyof typeof state.byId]?.displayTitle ?? sessionId)}
        previewMode={settings.previewMode}
        t={t}
      />
    </PanelFrame>
  )
}

function PanelFrame({ controller, t, children }: {
  readonly controller: MissionControlController
  readonly t: PanelProps['t']
  readonly children?: ReactNode
}): ReactNode {
  return (
    <section className="mc-panel" role="region" aria-label={t('action.label')}>
      <header className="mc-panel__topbar">
        <div className="mc-panel__brand">
          <span aria-hidden="true">◎</span>
          <span>{t('action.label')}</span>
          <span className="mc-panel__live">LIVE</span>
        </div>
        <button
          type="button"
          className="mc-panel__close"
          aria-label={t('overlay.close')}
          onClick={() => { controller.close() }}
        >×</button>
      </header>
      <div className="mc-panel__body">{children}</div>
    </section>
  )
}
