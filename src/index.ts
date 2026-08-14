/** Node half of the Mission Control Cordis plugin. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-token-meter'

import { resolveConfig, type Config as MissionConfig } from './config.ts'
import { MissionControlRuntime, type RuntimeServices } from './host/runtime.ts'
import { EVENTS_PATH, MissionSseEndpoint } from './host/sse.ts'

export * from './config.ts'
export * from './protocol.ts'
export * from './host/snapshot.ts'
export * from './host/tool-state.ts'
export * from './host/preview.ts'
export * from './host/runtime.ts'
export * from './host/sse.ts'

/** Stable Cordis plugin name. */
export const name = 'mission-control'

/** Services required by the live observer and same-origin SSE transport. */
export const inject = [
  'sessions',
  'agents',
  'sessionProjections',
  'tokenMeter',
  'webServer',
] as const

/**
 * Register the live observer and its exact Web route as one disposable effect.
 * @param ctx - Harness host context containing the required services.
 * @param input - optional loader configuration.
 */
export function apply(ctx: Context, input: MissionConfig = {}): void {
  const config = resolveConfig(input)
  ctx.effect(() => {
    const runtime = new MissionControlRuntime(runtimeServices(ctx), config)
    const endpoint = new MissionSseEndpoint(runtime, config.maxPendingFrames)
    const route: WebRoute = {
      kind: 'exact',
      path: EVENTS_PATH,
      handler: (request, response) => endpoint.handle(request, response),
    }
    let disposeRoute: (() => void) | undefined
    try {
      disposeRoute = ctx.webServer.register(route)
    } catch (error) {
      endpoint.dispose()
      runtime.dispose()
      throw error
    }
    return () => {
      disposeRoute?.()
      endpoint.dispose()
      runtime.dispose()
    }
  }, 'mission-control: runtime and SSE route')
}

function runtimeServices(ctx: Context): RuntimeServices {
  return {
    sessions: {
      list: () => ctx.sessions.list(),
      get: id => ctx.sessions.get(id as SessionId),
    },
    agents: {
      get: id => ctx.agents.get(id as SessionId),
    },
    projections: {
      snapshot: session => ctx.sessionProjections.snapshot(session as Session),
    },
    observe: {
      sessionCreated: listener => ctx.on(
        'session/created',
        session => listener(session),
        { global: true },
      ),
      sessionDisposed: listener => ctx.on(
        'session/disposed',
        session => listener(session),
        { global: true },
      ),
      sessionEvent: listener => ctx.on(
        'session/event',
        (session, event) => listener(session, event),
        { global: true },
      ),
      agentStatus: listener => ctx.on(
        'agent/status',
        ({ agent, status }: { agent: Agent; status: 'idle' | 'running' }) =>
          listener(agent.id, status),
        { global: true },
      ),
      projectionChanged: listener => ctx.sessionProjections.onChanged(
        (session, key, value) => listener(session, key, value),
      ),
    },
  }
}
