import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MissionControlController } from './controller.ts'
import type { NS } from './locales.ts'
import type { EventSourceFactory } from './source.ts'
import type { ResolvedConfig } from '../config.ts'
import { MissionControlPanel } from './Panel.tsx'
import { mountSidebarPanelHost } from './sidebar-host.ts'

/** Private action props supplied by the Mission Control registration. */
export interface MissionActionInjected {
  readonly controller: MissionControlController
}

type HeaderProps = PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<typeof NS> & MissionActionInjected

/** Session Header action that targets the bound Session. */
export function MissionHeaderAction({ controller, sessionId, t }: HeaderProps): ReactNode {
  return (
    <button
      type="button"
      className="mc-action"
      aria-label={t('action.open')}
      onClick={event => {
        controller.revealSidebar()
        controller.toggle(String(sessionId), event.currentTarget)
      }}
    >
      <span className="mc-action__mark" aria-hidden="true">◎</span>
      <span>{t('action.label')}</span>
    </button>
  )
}

type SidebarProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof NS> & MissionActionInjected
  & {
    readonly createSource?: EventSourceFactory
    readonly settings: Pick<ResolvedConfig, 'previewMode' | 'maxLiveRows' | 'velocityWindowMs'>
  }

/** Sidebar action targeting the globally selected Session. */
export function MissionSidebarAction({
  controller, createSource, settings, useSessions, wide, t,
}: SidebarProps): ReactNode {
  const sessionId = useSessions(state => state.current)
  const anchor = useRef<HTMLButtonElement>(null)
  const [host, setHost] = useState<HTMLDivElement>()

  useLayoutEffect(() => {
    controller.reportSidebarWide(wide)
  }, [controller, wide])
  useLayoutEffect(() => {
    if (anchor.current === null) return
    const mounted = mountSidebarPanelHost(anchor.current)
    setHost(mounted.element)
    return () => {
      mounted.dispose()
    }
  }, [])

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`mc-action${wide ? '' : ' mc-action--rail'}`}
        aria-label={t('action.open')}
        title={t('action.label')}
        disabled={sessionId === undefined}
        onClick={event => {
          controller.revealSidebar()
          controller.toggle(String(sessionId), event.currentTarget)
        }}
      >
        <span className="mc-action__mark" aria-hidden="true">◎</span>
        {wide ? <span>{t('action.label')}</span> : null}
      </button>
      {host === undefined ? null : createPortal(
        <MissionControlPanel
          controller={controller}
          {...(createSource === undefined ? {} : { createSource })}
          settings={settings}
          useSessions={useSessions}
          wide={wide}
          t={t}
        />,
        host,
      )}
    </>
  )
}
