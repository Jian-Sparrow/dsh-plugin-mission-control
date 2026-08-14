import { Context } from '@deepseek-ai/cordis'
import type { WebRoute, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it } from 'vitest'

import {
  apply,
  Config,
  EVENTS_PATH,
  inject,
  name,
} from '../../src/index.ts'

describe('Mission Control Cordis plugin', () => {
  it('registers one exact SSE route and removes it with the plugin fiber', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', {
      register: (route: WebRoute) => {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index !== -1) routes.splice(index, 1)
        }
      },
    } as WebServer)
    ctx.provide('sessions', {
      list: () => [],
      get: () => undefined,
    } as never)
    ctx.provide('agents', { get: () => undefined } as never)
    ctx.provide('sessionProjections', {
      snapshot: () => ({ asOfSeq: -1, values: {} }),
      onChanged: () => () => {},
    } as never)
    ctx.provide('tokenMeter', {} as never)

    const fiber = ctx.plugin({ name, inject: [...inject], Config, apply }, {})
    await fiber.await()

    expect(routes).toMatchObject([{ kind: 'exact', path: EVENTS_PATH }])

    await fiber.dispose()
    expect(routes).toEqual([])
    await ctx.fiber.dispose()
  })
})
