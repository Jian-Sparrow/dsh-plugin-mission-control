/** Mission Control browser plugin and public browser state surface. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { MissionHeaderAction, MissionSidebarAction } from './Action.tsx'
import { MissionControlController } from './controller.ts'
import { en, NS, zh, type MissionControlKey } from './locales.ts'
import { installStyles } from './styles.ts'
import { resolveConfig, type Config } from '../config.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    missionControl: MissionControlController
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'mission-control': MissionControlKey
  }
}

/** Browser services required by the plugin. */
export const inject = ['sessions', 'slots', 'locale', 'layout']

/** Register the Session header and rc.7 sidebar footer actions. */
export function apply(ctx: ClientContext, config: Config = {}): void {
  const controller = new MissionControlController(() => { ctx.layout.toggleSidebar() })
  const settings = resolveConfig(config)
  ctx.provide('missionControl', controller)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mission-control: browser dictionaries')
  ctx.effect(installStyles, 'mission-control: browser stylesheet')
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'mission-control-header',
    order: 30,
    locale: NS,
    inject: () => ({ controller }),
  }, MissionHeaderAction))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'mission-control-sidebar',
    order: 30,
    locale: NS,
    inject: () => ({ controller, settings }),
  }, MissionSidebarAction))
}

export { parseMissionMessage } from '../protocol.ts'
export * from './store.ts'
export * from './source.ts'
export * from './controller.ts'
export * from './Action.tsx'
export * from './Panel.tsx'
