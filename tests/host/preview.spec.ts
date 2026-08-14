import { describe, expect, it } from 'vitest'

import type { ResolvedConfig } from '../../src/config.ts'
import {
  previewArguments,
  previewResult,
} from '../../src/host/preview.ts'

const namesOnly = config({ previewMode: 'names-only' })
const redacted = config({ previewMode: 'redacted' })
const full = config({ previewMode: 'full' })

describe('Tool previews', () => {
  it('omits payloads in names-only mode', () => {
    expect(previewArguments('{"command":"echo hi"}', namesOnly)).toBeUndefined()
    expect(previewResult(result('hello'), namesOnly)).toBeUndefined()
  })

  it('recursively removes configured JSON fields', () => {
    expect(
      previewArguments(
        '{"token":"secret","path":"/tmp/a","nested":{"Password":"p"}}',
        redacted,
      ),
    ).toBe(
      '{"token":"[REDACTED]","path":"/tmp/a","nested":{"Password":"[REDACTED]"}}',
    )
  })

  it('removes credential patterns from parsed and malformed text', () => {
    expect(
      previewArguments('{"authorization":"Bearer abc.DEF-123"}', redacted),
    ).not.toContain('abc')
    expect(previewArguments('{broken Bearer abc.DEF-123', redacted)).toBe(
      '{broken Bearer [REDACTED]',
    )
  })

  it('truncates without splitting a UTF-8 sequence', () => {
    const small = config({ previewMode: 'full', maxPreviewBytes: 128 })
    const preview = previewArguments(
      JSON.stringify({ text: '汉'.repeat(2_000) }),
      small,
    )
    expect(Buffer.byteLength(preview ?? '')).toBeLessThanOrEqual(128)
    expect(preview).toMatch(/…$/)
    expect(preview).not.toContain('�')
  })

  it('keeps malformed JSON verbatim in full mode', () => {
    expect(previewArguments('{broken', full)).toBe('{broken')
  })

  it('extracts visible text from Tool results before redaction', () => {
    expect(previewResult(result('token=abc123'), redacted)).toBe(
      'token=[REDACTED]',
    )
  })
})

function result(text: string) {
  return {
    data: {
      message: {
        content: [{
          type: 'tool-result',
          content: [{ type: 'text', text }],
        }],
      },
    },
  }
}

function config(overrides: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    previewMode: 'names-only',
    maxPreviewBytes: 2_048,
    sensitiveFieldNames: [
      'authorization',
      'api_key',
      'apikey',
      'password',
      'secret',
      'token',
    ],
    tokenPublishIntervalMs: 250,
    velocityWindowMs: 5_000,
    maxLiveRows: 300,
    maxPendingFrames: 64,
    ...overrides,
  }
}
