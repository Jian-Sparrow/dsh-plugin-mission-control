import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ResolvedConfig } from '../config.ts'
import { MissionDashboard } from './components/MissionDashboard.tsx'
import type { MissionControlController, MissionPresentation } from './controller.ts'
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
    return placeFrame(
      <PanelFrame
        presentation={state.presentation}
        controller={controller}
        t={props.t}
      />,
      state.presentation,
    )
  }
  return <LiveMission
    {...props}
    sessionId={state.sessionId}
    generation={state.generation}
    presentation={state.presentation}
  />
}

function LiveMission({
  controller, createSource, settings, sessionId, generation, t, useSessions,
  presentation,
}: PanelProps & {
  readonly sessionId: string
  readonly generation: number
  readonly presentation: MissionPresentation
}): ReactNode {
  const store = useMemo(() => new MissionStore({
    generation,
    maxLiveRows: settings.maxLiveRows,
    velocityWindowMs: settings.velocityWindowMs,
  }), [generation, settings.maxLiveRows, settings.velocityWindowMs])
  const source = useMemo(() => new MissionSource(store, createSource), [createSource, store])
  const previousPresentation = useRef(presentation)
  const autoFocusExpand = previousPresentation.current === 'fullscreen'
    && presentation === 'inline'

  useEffect(() => {
    source.open(sessionId, generation)
    return () => { source.close() }
  }, [generation, sessionId, source])
  useEffect(() => {
    previousPresentation.current = presentation
  }, [presentation])

  return placeFrame(
    <PanelFrame
      presentation={presentation}
      controller={controller}
      t={t}
      autoFocusExpand={autoFocusExpand}
    >
      <MissionDashboard
        store={store}
        controller={controller}
        sessionTitle={useSessions(state => state.byId[sessionId as keyof typeof state.byId]?.displayTitle ?? sessionId)}
        previewMode={settings.previewMode}
        presentation={presentation}
        t={t}
      />
    </PanelFrame>,
    presentation,
  )
}

function PanelFrame({ presentation, controller, t, autoFocusExpand = false, children }: {
  readonly presentation: MissionPresentation
  readonly controller: MissionControlController
  readonly t: PanelProps['t']
  readonly autoFocusExpand?: boolean
  readonly children?: ReactNode
}): ReactNode {
  const fullscreen = presentation === 'fullscreen'
  return (
    <section
      className={`mc-panel${fullscreen ? ' mc-panel--fullscreen' : ''}`}
      role={fullscreen ? 'dialog' : 'region'}
      {...(fullscreen ? { 'aria-modal': true } : {})}
      aria-label={t('action.label')}
      onKeyDown={event => {
        if (event.key === 'Escape') controller.close()
      }}
    >
      <header className="mc-panel__topbar">
        <div className="mc-panel__brand">
          <span aria-hidden="true">◎</span>
          <span>{t('action.label')}</span>
          <span className="mc-panel__live">LIVE</span>
        </div>
        <div className="mc-panel__actions">
          {fullscreen
            ? <button
                type="button"
                className="mc-panel__resize"
                aria-label={t('panel.restore')}
                onClick={() => { controller.restore() }}
              >↙</button>
            : <button
                type="button"
                className="mc-panel__resize"
                aria-label={t('panel.expand')}
                autoFocus={autoFocusExpand}
                onClick={() => { controller.expand() }}
              >⛶</button>}
          <button
            type="button"
            className="mc-panel__close"
            aria-label={t('overlay.close')}
            onClick={() => { controller.close() }}
          >×</button>
        </div>
      </header>
      <div className="mc-panel__body">{children}</div>
    </section>
  )
}

function placeFrame(frame: ReactNode, presentation: MissionPresentation): ReactNode {
  return presentation === 'fullscreen' ? createPortal(frame, document.body) : frame
}
