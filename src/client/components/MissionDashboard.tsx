import { useState, useSyncExternalStore, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PreviewMode } from '../../config.ts'
import type { MissionControlController } from '../controller.ts'
import type { MissionStore } from '../store.ts'
import type { NS } from '../locales.ts'
import { AgentTree } from './AgentTree.tsx'
import { GlobalHud } from './GlobalHud.tsx'
import { ToolStream } from './ToolStream.tsx'

/** Complete live Dashboard inputs. */
export interface MissionDashboardProps {
  readonly store: MissionStore
  readonly controller: MissionControlController
  readonly sessionTitle: string
  readonly previewMode: PreviewMode
  readonly t: TranslateNS<typeof NS>
  readonly now?: () => number
}

/** Render HUD, Agent topology, and Tool stream from one immutable store view. */
export function MissionDashboard({ store, controller, sessionTitle, previewMode, t, now = Date.now }: MissionDashboardProps): ReactNode {
  const state = useSyncExternalStore(listener => store.subscribe(listener), () => store.getSnapshot())
  const [tab, setTab] = useState<'agents' | 'tools'>('agents')
  const mission = state.mission
  return (
    <div
      className="mc-dashboard"
      role="region"
      aria-label={t('dashboard.aria')}
      tabIndex={-1}
      onKeyDown={event => { if (event.key === 'Escape') controller.close() }}
    >
      <GlobalHud state={state} sessionTitle={sessionTitle} previewMode={previewMode} t={t} />
      <div className="mc-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'agents'} onClick={() => { setTab('agents') }}>
          {t('tabs.agents')} <span>{mission?.agents.length ?? 0}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'tools'} onClick={() => { setTab('tools') }}>
          {t('tabs.tools')} <span>{state.visibleTools.length}</span>
        </button>
      </div>
      <div className="mc-dashboard__content" role="tabpanel">
        {mission === undefined
          ? <p className="mc-dashboard__empty">{t('panel.connecting')}</p>
          : tab === 'agents' ? <AgentTree
              agents={mission.agents}
              rootId={mission.rootId}
              selectedAgentId={state.selectedAgentId}
              select={id => { store.selectAgent(id) }}
              t={t}
            /> : <ToolStream
              tools={state.visibleTools}
              agents={mission.agents}
              previewMode={previewMode}
              following={state.followingTools}
              store={store}
              now={now}
              t={t}
            />}
      </div>
    </div>
  )
}
