import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MissionControlController } from './controller.ts'
import type { NS } from './locales.ts'

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
      onClick={event => { controller.open(String(sessionId), event.currentTarget) }}
    >
      <span className="mc-action__mark" aria-hidden="true">◎</span>
      <span>{t('action.label')}</span>
    </button>
  )
}

type SidebarProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof NS> & MissionActionInjected

/** Sidebar action targeting the globally selected Session. */
export function MissionSidebarAction({ controller, useSessions, wide, t }: SidebarProps): ReactNode {
  const sessionId = useSessions(state => state.current)
  return (
    <button
      type="button"
      className={`mc-action${wide ? '' : ' mc-action--rail'}`}
      aria-label={t('action.open')}
      title={t('action.label')}
      disabled={sessionId === undefined}
      onClick={event => {
        if (sessionId !== undefined) controller.open(String(sessionId), event.currentTarget)
      }}
    >
      <span className="mc-action__mark" aria-hidden="true">◎</span>
      {wide ? <span>{t('action.label')}</span> : null}
    </button>
  )
}
