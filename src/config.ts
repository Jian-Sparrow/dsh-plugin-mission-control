import Schema from '@deepseek-ai/schemastery'

/** Tool payload visibility offered by Mission Control. */
export type PreviewMode = 'names-only' | 'redacted' | 'full'

/** User-supplied Mission Control configuration. */
export interface Config {
  readonly previewMode?: PreviewMode
  readonly maxPreviewBytes?: number
  readonly sensitiveFieldNames?: string[]
  readonly tokenPublishIntervalMs?: number
  readonly velocityWindowMs?: number
  readonly maxLiveRows?: number
  readonly maxPendingFrames?: number
}

/** Fully validated configuration used by the host and browser plugins. */
export interface ResolvedConfig {
  readonly previewMode: PreviewMode
  readonly maxPreviewBytes: number
  readonly sensitiveFieldNames: readonly string[]
  readonly tokenPublishIntervalMs: number
  readonly velocityWindowMs: number
  readonly maxLiveRows: number
  readonly maxPendingFrames: number
}

/** Cordis configuration metadata. Defaults are applied only by {@link resolveConfig}. */
export const Config = Schema.object({
  previewMode: Schema.union([
    Schema.const('names-only'),
    Schema.const('redacted'),
    Schema.const('full'),
  ]),
  maxPreviewBytes: Schema.number().step(1).min(128).max(65_536),
  sensitiveFieldNames: Schema.array(Schema.string()),
  tokenPublishIntervalMs: Schema.number().step(1).min(50).max(5_000),
  velocityWindowMs: Schema.number().step(1).min(1_000).max(60_000),
  maxLiveRows: Schema.number().step(1).min(50).max(2_000),
  maxPendingFrames: Schema.number().step(1).min(8).max(512),
})

const DEFAULT_CONFIG: ResolvedConfig = {
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
}

/**
 * Validate plugin configuration and apply all deployment defaults.
 * @param input - loader configuration supplied for this plugin.
 * @returns immutable runtime configuration with every field populated.
 */
export function resolveConfig(input: Config): ResolvedConfig {
  const validated = Config(input)
  return {
    previewMode: validated.previewMode ?? DEFAULT_CONFIG.previewMode,
    maxPreviewBytes: validated.maxPreviewBytes ?? DEFAULT_CONFIG.maxPreviewBytes,
    sensitiveFieldNames:
      input.sensitiveFieldNames === undefined
        ? DEFAULT_CONFIG.sensitiveFieldNames
        : (validated.sensitiveFieldNames ?? DEFAULT_CONFIG.sensitiveFieldNames),
    tokenPublishIntervalMs:
      validated.tokenPublishIntervalMs ?? DEFAULT_CONFIG.tokenPublishIntervalMs,
    velocityWindowMs:
      validated.velocityWindowMs ?? DEFAULT_CONFIG.velocityWindowMs,
    maxLiveRows: validated.maxLiveRows ?? DEFAULT_CONFIG.maxLiveRows,
    maxPendingFrames:
      validated.maxPendingFrames ?? DEFAULT_CONFIG.maxPendingFrames,
  }
}
