/** Mission Control browser plugin and public browser state surface. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { MissionHeaderAction, MissionSidebarAction } from './Action.tsx'
import { MissionControlController } from './controller.ts'
import { en, NS, zh, type MissionControlKey } from './locales.ts'
import { MissionControlPanel } from './Panel.tsx'
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

interface SidebarReveal {
  openSidebar(): void
}

/** Register Session actions plus the persistent sidebar panel. */
export function apply(ctx: ClientContext, config: Config = {}): void {
  const controller = new MissionControlController()
  const settings = resolveConfig(config)
  const openSidebar = () => { (ctx.layout as typeof ctx.layout & SidebarReveal).openSidebar() }
  ctx.provide('missionControl', controller)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mission-control: browser dictionaries')
  ctx.effect(installStyles, 'mission-control: browser stylesheet')
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'mission-control-header',
    order: 30,
    locale: NS,
    inject: () => ({ controller, openSidebar }),
  }, MissionHeaderAction))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'mission-control-sidebar',
    order: 30,
    locale: NS,
    inject: () => ({ controller, openSidebar }),
  }, MissionSidebarAction))
  ctx.slots.inject('sidebar.auxiliary', () => ctx.slots.register({
    name: 'sidebar.auxiliary',
    locale: NS,
    inject: () => ({ controller, settings }),
  }, MissionControlPanel))
}

export { parseMissionMessage } from '../protocol.ts'
export * from './store.ts'
export * from './source.ts'
export * from './controller.ts'
export * from './Action.tsx'
export * from './Panel.tsx'
