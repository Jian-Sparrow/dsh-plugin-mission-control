import type { ResolvedConfig } from '../config.ts'

const REDACTED = '[REDACTED]'

/**
 * Apply the configured privacy policy to raw model-supplied Tool arguments.
 * @param raw - exact `tool/call` argument string.
 * @param config - resolved preview policy and byte limit.
 * @returns a bounded preview, or undefined when payloads are disabled.
 */
export function previewArguments(
  raw: string,
  config: ResolvedConfig,
): string | undefined {
  if (config.previewMode === 'names-only') return undefined
  const visible = config.previewMode === 'full'
    ? raw
    : redactPayload(raw, config.sensitiveFieldNames)
  return truncateUtf8(visible, config.maxPreviewBytes)
}

/**
 * Extract visible text from a Tool result and apply the configured privacy policy.
 * @param event - durable `tool/result` event or an equivalent structural value.
 * @param config - resolved preview policy and byte limit.
 * @returns a bounded visible-text preview, or undefined when none is allowed.
 */
export function previewResult(
  event: unknown,
  config: ResolvedConfig,
): string | undefined {
  if (config.previewMode === 'names-only') return undefined
  const raw = visibleResultText(event)
  if (raw === undefined) return undefined
  const visible = config.previewMode === 'full'
    ? raw
    : redactPayload(raw, config.sensitiveFieldNames)
  return truncateUtf8(visible, config.maxPreviewBytes)
}

function redactPayload(raw: string, sensitiveFieldNames: readonly string[]): string {
  try {
    const parsed: unknown = JSON.parse(raw)
    return JSON.stringify(redactValue(parsed, new Set(sensitiveFieldNames.map(name => name.toLowerCase()))))
  } catch {
    // Tool arguments are allowed to be malformed JSON; redact their raw text instead.
    return redactText(raw)
  }
}

function redactValue(value: unknown, sensitive: ReadonlySet<string>): unknown {
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.map(item => redactValue(item, sensitive))
  if (!isRecord(value)) return value

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    output[key] = sensitive.has(key.toLowerCase())
      ? REDACTED
      : redactValue(item, sensitive)
  }
  return output
}

function redactText(value: string): string {
  return value
    .replace(
      /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/giu,
      REDACTED,
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, `Bearer ${REDACTED}`)
    .replace(
      /\b(api[_-]?key|token|secret|password)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}\]]+)/giu,
      (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`,
    )
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(value)
  if (encoded.byteLength <= maxBytes) return value

  const suffix = '…'
  const suffixBytes = encoder.encode(suffix).byteLength
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let end = maxBytes - suffixBytes
  while (end > 0) {
    try {
      return `${decoder.decode(encoded.subarray(0, end))}${suffix}`
    } catch {
      end--
    }
  }
  return suffix
}

function visibleResultText(event: unknown): string | undefined {
  if (!isRecord(event) || !isRecord(event.data) || !isRecord(event.data.message)) {
    return undefined
  }
  const outer = event.data.message.content
  if (!Array.isArray(outer)) return undefined

  const text: string[] = []
  for (const block of outer) {
    if (!isRecord(block) || block.type !== 'tool-result' || !Array.isArray(block.content)) {
      continue
    }
    for (const resultBlock of block.content) {
      if (isRecord(resultBlock)
        && resultBlock.type === 'text'
        && typeof resultBlock.text === 'string') {
        text.push(resultBlock.text)
      }
    }
  }
  return text.length === 0 ? undefined : text.join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
