import type { ModelPrice } from '../pricing.ts'
import { findModelPrice } from '../pricing.ts'
import type { TokenBuckets } from '../protocol.ts'

/** Priced token usage grouped by one exact provider/model route. */
export interface CostBreakdown {
  readonly provider: string
  readonly model: string
  readonly price: ModelPrice
  readonly tokens: TokenBuckets
  readonly cny: number
}

/** Estimated cost and model-step coverage for one live scope. */
export interface CostEstimate {
  readonly cny: number
  readonly pricedSteps: number
  readonly unpricedSteps: number
  readonly breakdown: readonly CostBreakdown[]
}

interface CostSample {
  readonly tokens: TokenBuckets
  readonly price?: ModelPrice | undefined
}

/** Mutable replay state keyed by the Session log's turn and step ids. */
export interface CostTracker {
  currentStep?: string | undefined
  currentRoute?: { readonly provider: string; readonly model: string } | undefined
  readonly routes: Map<string, { readonly provider: string; readonly model: string }>
  readonly stepTimes: Map<string, number>
  readonly samples: Map<string, CostSample>
}

/**
 * Replay Session events into a cost tracker.
 * @param events - ordered durable Session events.
 * @returns mutable state ready for later live events.
 */
export function createCostTracker(
  events: readonly unknown[] = [],
): CostTracker {
  const tracker: CostTracker = {
    routes: new Map(),
    stepTimes: new Map(),
    samples: new Map(),
  }
  for (const event of events) applyCostEvent(tracker, event)
  return tracker
}

/**
 * Apply one Session event to cost state.
 * @param tracker - current per-Session cost state.
 * @param event - one untrusted Session event.
 * @returns true only when a usage sample changed.
 */
export function applyCostEvent(tracker: CostTracker, event: unknown): boolean {
  if (!isRecord(event) || !isRecord(event.data)) return false

  if (event.type === 'step/start') {
    const key = stepKey(event.data.turn, event.data.step)
    if (key !== undefined) {
      tracker.currentStep = key
      const timestamp = readTimestamp(event.time)
      if (timestamp !== undefined) tracker.stepTimes.set(key, timestamp)
      if (tracker.currentRoute !== undefined) {
        tracker.routes.set(key, tracker.currentRoute)
      }
    }
    return false
  }

  if (event.type === 'request/header') {
    const config = readRequestConfig(event.data)
    if (config !== undefined) {
      tracker.currentRoute = config
      if (tracker.currentStep !== undefined) {
        tracker.routes.set(tracker.currentStep, config)
      }
    }
    return false
  }

  const sample = readUsageSample(event, event.data)
  if (sample === undefined) return false
  const route = tracker.routes.get(sample.key)
  const timestamp = tracker.stepTimes.get(sample.key) ?? readTimestamp(event.time)
  const next: CostSample = {
    tokens: sample.tokens,
    ...(route === undefined || timestamp === undefined
      ? {}
      : { price: findModelPrice(route.provider, route.model, timestamp) }),
  }
  const previous = tracker.samples.get(sample.key)
  if (previous !== undefined && samplesEqual(previous, next)) return false
  tracker.samples.set(sample.key, next)
  return true
}

/**
 * Calculate the current estimate without rounding intermediate values.
 * @param tracker - per-step route and usage state.
 * @returns priced totals, coverage counts, and deterministic route rows.
 */
export function estimateCost(tracker: CostTracker): CostEstimate {
  const rows = new Map<string, CostBreakdown>()
  let pricedSteps = 0
  let unpricedSteps = 0

  for (const sample of tracker.samples.values()) {
    if (sample.price === undefined) {
      unpricedSteps += 1
      continue
    }
    pricedSteps += 1
    const price = sample.price
    const cny = priceTokens(sample.tokens, price)
    const key = `${price.provider}:${price.model}:${price.period}`
    const previous = rows.get(key)
    rows.set(key, previous === undefined
      ? {
          provider: price.provider,
          model: price.model,
          price,
          tokens: sample.tokens,
          cny,
        }
      : {
          ...previous,
          tokens: addTokens(previous.tokens, sample.tokens),
          cny: previous.cny + cny,
        })
  }

  const breakdown = [...rows.values()].sort((left, right) =>
    `${left.provider}:${left.model}:${left.price.period}`.localeCompare(
      `${right.provider}:${right.model}:${right.price.period}`,
    ),
  )
  return {
    cny: breakdown.reduce((total, row) => total + row.cny, 0),
    pricedSteps,
    unpricedSteps,
    breakdown,
  }
}

/**
 * Combine independent Session estimates into one mission estimate.
 * @param values - estimates for the root Session and included descendants.
 * @returns aggregate totals and deterministic provider/model rows.
 */
export function addCostEstimates(values: Iterable<CostEstimate>): CostEstimate {
  const rows = new Map<string, CostBreakdown>()
  let cny = 0
  let pricedSteps = 0
  let unpricedSteps = 0

  for (const value of values) {
    cny += value.cny
    pricedSteps += value.pricedSteps
    unpricedSteps += value.unpricedSteps
    for (const row of value.breakdown) {
      const key = `${row.provider}:${row.model}:${row.price.period}`
      const previous = rows.get(key)
      rows.set(key, previous === undefined
        ? row
        : {
            ...previous,
            tokens: addTokens(previous.tokens, row.tokens),
            cny: previous.cny + row.cny,
          })
    }
  }

  return {
    cny,
    pricedSteps,
    unpricedSteps,
    breakdown: [...rows.values()].sort((left, right) =>
      `${left.provider}:${left.model}:${left.price.period}`.localeCompare(
        `${right.provider}:${right.model}:${right.price.period}`,
      ),
    ),
  }
}

function readRequestConfig(
  data: Record<string, unknown>,
): { readonly provider: string; readonly model: string } | undefined {
  if (!isRecord(data.header) || !isRecord(data.header.config)) return undefined
  const { provider, model } = data.header.config
  return typeof provider === 'string' && typeof model === 'string'
    ? { provider, model }
    : undefined
}

function readUsageSample(
  event: Record<string, unknown>,
  data: Record<string, unknown>,
): { readonly key: string; readonly tokens: TokenBuckets } | undefined {
  let usage: unknown
  if (event.type === 'assistant/chunk' && isRecord(data.chunk)
    && data.chunk.type === 'usage') {
    usage = data.chunk.usage
  } else if (event.type === 'assistant/message') {
    usage = data.usage
  } else {
    return undefined
  }
  const key = stepKey(data.turn, data.step)
  const tokens = readTokens(usage)
  return key === undefined || tokens === undefined ? undefined : { key, tokens }
}

function readTokens(value: unknown): TokenBuckets | undefined {
  if (!isRecord(value)) return undefined
  const inputTokens = readToken(value.inputTokens)
  const outputTokens = readToken(value.outputTokens)
  if (inputTokens === undefined || outputTokens === undefined) return undefined
  const cacheReadTokens = value.cacheReadTokens === undefined
    ? 0
    : readToken(value.cacheReadTokens)
  const cacheWriteTokens = value.cacheWriteTokens === undefined
    ? 0
    : readToken(value.cacheWriteTokens)
  if (cacheReadTokens === undefined || cacheWriteTokens === undefined) {
    return undefined
  }
  return {
    uncachedInputTokens: inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  }
}

function readToken(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : undefined
}

function readTimestamp(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : undefined
}

function stepKey(turn: unknown, step: unknown): string | undefined {
  return Number.isSafeInteger(turn) && Number(turn) >= 0
    && Number.isSafeInteger(step) && Number(step) >= 0
    ? `${Number(turn)}:${Number(step)}`
    : undefined
}

function samplesEqual(left: CostSample, right: CostSample): boolean {
  return left.price === right.price && tokensEqual(left.tokens, right.tokens)
}

function tokensEqual(left: TokenBuckets, right: TokenBuckets): boolean {
  return left.uncachedInputTokens === right.uncachedInputTokens
    && left.outputTokens === right.outputTokens
    && left.cacheReadTokens === right.cacheReadTokens
    && left.cacheWriteTokens === right.cacheWriteTokens
}

function addTokens(left: TokenBuckets, right: TokenBuckets): TokenBuckets {
  return {
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  }
}

function priceTokens(tokens: TokenBuckets, price: ModelPrice): number {
  return (
    tokens.uncachedInputTokens * price.cacheMissCnyPerMillion
    + tokens.cacheReadTokens * price.cacheHitCnyPerMillion
    + tokens.cacheWriteTokens * price.cacheWriteCnyPerMillion
    + tokens.outputTokens * price.outputCnyPerMillion
  ) / 1_000_000
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
