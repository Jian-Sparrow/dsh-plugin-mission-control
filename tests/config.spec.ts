import { describe, expect, it } from 'vitest'

import { resolveConfig } from '../src/config.ts'

describe('resolveConfig', () => {
  it('applies the Mission Control defaults', () => {
    expect(resolveConfig({})).toEqual({
      previewMode: 'names-only',
      maxPreviewBytes: 2048,
      sensitiveFieldNames: [
        'authorization',
        'api_key',
        'apikey',
        'password',
        'secret',
        'token',
      ],
      tokenPublishIntervalMs: 250,
      velocityWindowMs: 5000,
      maxLiveRows: 300,
      maxPendingFrames: 64,
    })
  })

  it('rejects an invalid token publication interval', () => {
    expect(() => resolveConfig({ tokenPublishIntervalMs: 0 })).toThrow(
      /tokenPublishIntervalMs/,
    )
  })
})
