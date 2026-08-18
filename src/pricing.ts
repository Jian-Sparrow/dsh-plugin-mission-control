/** Version and source metadata for the bundled prices. */
export interface PricingMetadata {
  readonly revision: 'deepseek-2026-08-18'
  readonly priceCheckedAt: '2026-08-18'
  readonly priceSource: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'
  readonly timeZone: 'Asia/Shanghai'
  readonly peakHours: '09:00-12:00, 14:00-18:00'
}

/** DeepSeek billing period selected from China Standard Time. */
export type PricingPeriod = 'off-peak' | 'peak'

/** Official CNY prices for one exact DeepSeek provider/model route and period. */
export interface ModelPrice {
  readonly provider: 'deepseek-official'
  readonly model: 'deepseek-v4-flash' | 'deepseek-v4-pro'
  readonly period: PricingPeriod
  readonly cacheHitCnyPerMillion: number
  readonly cacheMissCnyPerMillion: number
  readonly outputCnyPerMillion: number
  readonly cacheWriteCnyPerMillion: 0
}

interface ModelSchedule {
  readonly provider: ModelPrice['provider']
  readonly model: ModelPrice['model']
  readonly offPeak: Omit<ModelPrice, 'provider' | 'model' | 'period'>
  readonly peak: Omit<ModelPrice, 'provider' | 'model' | 'period'>
}

/** Immutable model-price schedules and their source metadata. */
export interface PricingCatalog {
  readonly metadata: PricingMetadata
  readonly models: readonly ModelSchedule[]
}

/** DeepSeek prices bundled with this plugin release. */
export const DEEPSEEK_PRICING: PricingCatalog = Object.freeze({
  metadata: Object.freeze({
    revision: 'deepseek-2026-08-18',
    priceCheckedAt: '2026-08-18',
    priceSource: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
    timeZone: 'Asia/Shanghai',
    peakHours: '09:00-12:00, 14:00-18:00',
  }),
  models: Object.freeze([
    schedule('deepseek-v4-flash', [0.05, 1.5, 4.5], [0.1, 3, 9]),
    schedule('deepseek-v4-pro', [0.15, 4.5, 13.5], [0.3, 9, 27]),
  ]),
})

/**
 * Find the price for an exact provider/model route at one request time.
 * @param provider - provider id recorded in the request header.
 * @param model - model id recorded in the request header.
 * @param timestamp - request timestamp in Unix milliseconds.
 * @returns the matching official CNY price, or undefined for an unpriced route.
 */
export function findModelPrice(
  provider: string,
  model: string,
  timestamp: number,
): ModelPrice | undefined {
  const entry = DEEPSEEK_PRICING.models.find(
    candidate => candidate.provider === provider && candidate.model === model,
  )
  if (entry === undefined) return undefined
  const period = pricingPeriod(timestamp)
  return {
    provider: entry.provider,
    model: entry.model,
    period,
    ...entry[period === 'peak' ? 'peak' : 'offPeak'],
  }
}

/**
 * Resolve the DeepSeek billing period in China Standard Time.
 * @param timestamp - request timestamp in Unix milliseconds.
 * @returns the peak or off-peak billing period.
 */
export function pricingPeriod(timestamp: number): PricingPeriod {
  const shifted = new Date(timestamp + 8 * 60 * 60 * 1_000)
  const minute = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  return minute >= 9 * 60 && minute < 12 * 60
    || minute >= 14 * 60 && minute < 18 * 60
    ? 'peak'
    : 'off-peak'
}

function schedule(
  model: ModelSchedule['model'],
  offPeak: readonly [cacheHit: number, cacheMiss: number, output: number],
  peak: readonly [cacheHit: number, cacheMiss: number, output: number],
): ModelSchedule {
  return Object.freeze({
    provider: 'deepseek-official',
    model,
    offPeak: unitPrices(offPeak),
    peak: unitPrices(peak),
  })
}

function unitPrices(
  values: readonly [cacheHit: number, cacheMiss: number, output: number],
): ModelSchedule['offPeak'] {
  return Object.freeze({
    cacheHitCnyPerMillion: values[0],
    cacheMissCnyPerMillion: values[1],
    outputCnyPerMillion: values[2],
    cacheWriteCnyPerMillion: 0,
  })
}
