/** Version and source metadata for the bundled prices and reference rate. */
export interface PricingMetadata {
  readonly revision: 'deepseek-2026-08-17'
  readonly priceCheckedAt: '2026-08-17'
  readonly priceSource: 'https://api-docs.deepseek.com/quick_start/pricing'
  readonly usdToCny: 6.7894
  readonly fxEffectiveAt: '2026-07-31'
  readonly fxSource: 'https://fec.mofcom.gov.cn/article/zyfw/jrfw/jrfwywzn/jrfwwh/hlfxglzy/202607/7208.html'
}

/** Official USD prices for one exact DeepSeek provider/model route. */
export interface ModelPrice {
  readonly provider: 'deepseek-official'
  readonly model: 'deepseek-v4-flash' | 'deepseek-v4-pro'
  readonly cacheHitUsdPerMillion: number
  readonly cacheMissUsdPerMillion: number
  readonly outputUsdPerMillion: number
  readonly cacheWriteUsdPerMillion: 0
}

/** Immutable model prices and their source metadata. */
export interface PricingCatalog {
  readonly metadata: PricingMetadata
  readonly models: readonly ModelPrice[]
}

/** DeepSeek prices and reference conversion bundled with this plugin release. */
export const DEEPSEEK_PRICING: PricingCatalog = Object.freeze({
  metadata: Object.freeze({
    revision: 'deepseek-2026-08-17',
    priceCheckedAt: '2026-08-17',
    priceSource: 'https://api-docs.deepseek.com/quick_start/pricing',
    usdToCny: 6.7894,
    fxEffectiveAt: '2026-07-31',
    fxSource: 'https://fec.mofcom.gov.cn/article/zyfw/jrfw/jrfwywzn/jrfwwh/hlfxglzy/202607/7208.html',
  }),
  models: Object.freeze([
    Object.freeze({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      cacheHitUsdPerMillion: 0.0028,
      cacheMissUsdPerMillion: 0.14,
      outputUsdPerMillion: 0.28,
      cacheWriteUsdPerMillion: 0,
    }),
    Object.freeze({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      cacheHitUsdPerMillion: 0.003625,
      cacheMissUsdPerMillion: 0.435,
      outputUsdPerMillion: 0.87,
      cacheWriteUsdPerMillion: 0,
    }),
  ]),
})

/**
 * Find the price for an exact provider/model route.
 * @param provider - provider id recorded in the request header.
 * @param model - model id recorded in the request header.
 * @returns the matching official price, or undefined for an unpriced route.
 */
export function findModelPrice(
  provider: string,
  model: string,
): ModelPrice | undefined {
  return DEEPSEEK_PRICING.models.find(
    entry => entry.provider === provider && entry.model === model,
  )
}
