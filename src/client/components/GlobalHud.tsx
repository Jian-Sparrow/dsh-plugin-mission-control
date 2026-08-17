import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PreviewMode } from '../../config.ts'
import type { MissionStoreSnapshot } from '../store.ts'
import type { NS } from '../locales.ts'
import { costCoverage, formatCny, formatUsd } from '../cost-format.ts'

/** HUD rendering inputs. */
export interface GlobalHudProps {
  readonly state: MissionStoreSnapshot
  readonly sessionTitle: string
  readonly previewMode: PreviewMode
  readonly t: TranslateNS<typeof NS>
}

/** Render authoritative token totals and current live activity. */
export function GlobalHud({ state, sessionTitle, previewMode, t }: GlobalHudProps): ReactNode {
  const totals = state.visibleTotals
  const total = totals.uncachedInputTokens + totals.outputTokens
    + totals.cacheReadTokens + totals.cacheWriteTokens
  const selected = state.selectedAgentId
  const agents = selected === undefined ? state.mission?.agents.length ?? 0 : 1
  const runningTools = state.visibleTools.filter(tool => tool.status === 'running').length
  const cost = state.visibleCost
  const coverage = costCoverage(cost)
  const pricing = state.mission?.pricing
  const coverageLabel = coverage === 'partial'
    ? t('hud.partialEstimate')
    : coverage === 'unavailable'
      ? t('hud.noPrice')
      : t('hud.estimate')
  return (
    <section className="mc-hud" aria-label={t('hud.aria')}>
      <div className="mc-hud__identity">
        <span className={`mc-connection mc-connection--${state.connection}`} aria-hidden="true" />
        <div><strong>{sessionTitle}</strong><span>{t(`connection.${state.connection}`)}</span></div>
      </div>
      <Metric label={t('hud.total')} value={format(total)} prominent />
      <div className={`mc-cost mc-cost--${coverage}`}>
        <span>{t('hud.estimatedCost')}</span>
        <strong>{coverage === 'unavailable' ? coverageLabel : `≈ ${formatCny(cost)}`}</strong>
        {coverage === 'unavailable' ? null : <small>{coverageLabel}</small>}
        {pricing === undefined ? null : (
          <details>
            <summary>{t('hud.costDetails')}</summary>
            <div className="mc-cost__details">
              <strong>{t('hud.notBill')}</strong>
              <span>{t('hud.usdSubtotal')}: <strong>{formatUsd(cost)}</strong></span>
              <span>{t('hud.exchangeRate', { rate: pricing.usdToCny })}</span>
              <span>{t('hud.priceCheckedAt', { date: pricing.priceCheckedAt })}</span>
              <span>{t('hud.fxEffectiveAt', { date: pricing.fxEffectiveAt })}</span>
              {cost.unpricedSteps === 0
                ? null
                : <span>{t('hud.unpricedSteps', { count: cost.unpricedSteps })}</span>}
              {cost.breakdown.map(row => (
                <div className="mc-cost__model" key={`${row.provider}:${row.model}`}>
                  <strong>{row.provider} / {row.model}</strong>
                  <span>{t('hud.modelPrice', { model: row.model })}: ${row.price.cacheHitUsdPerMillion}/M cache hit · ${row.price.cacheMissUsdPerMillion}/M cache miss · ${row.price.outputUsdPerMillion}/M output · ${row.price.cacheWriteUsdPerMillion}/M cache write</span>
                  <span>{t('hud.input')}: {format(row.tokens.uncachedInputTokens)} · {t('hud.output')}: {format(row.tokens.outputTokens)} · {t('hud.cacheRead')}: {format(row.tokens.cacheReadTokens)} · {t('hud.cacheWrite')}: {format(row.tokens.cacheWriteTokens)}</span>
                  <span>USD {formatUsd(row)} · CNY {formatCny(row)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      <Metric label={t('hud.input')} value={format(totals.uncachedInputTokens)} />
      <Metric label={t('hud.output')} value={format(totals.outputTokens)} />
      <Metric label={t('hud.cacheRead')} value={format(totals.cacheReadTokens)} />
      <Metric label={t('hud.cacheWrite')} value={format(totals.cacheWriteTokens)} />
      <Metric label={t('hud.rate')} value={`${state.recentTokensPerSecond.toFixed(1)}/s`} />
      <div className="mc-hud__counts">
        <span>{t(agents === 1 ? 'hud.agent' : 'hud.agents', { count: agents })}</span>
        <span>{t(runningTools === 1 ? 'hud.runningTool' : 'hud.runningTools', { count: runningTools })}</span>
        {state.mission?.diagnostics === 0 ? null : <span>{t('hud.diagnostics', { count: state.mission?.diagnostics ?? 0 })}</span>}
      </div>
      {previewMode === 'full' ? <div className="mc-hud__warning" role="status">⚠ {t('hud.fullWarning')}</div> : null}
    </section>
  )
}

function Metric({ label, value, prominent = false }: {
  readonly label: string
  readonly value: string
  readonly prominent?: boolean
}): ReactNode {
  return <div className={`mc-metric${prominent ? ' mc-metric--prominent' : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

function format(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}
