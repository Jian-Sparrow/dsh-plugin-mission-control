# Mission Control Cost Estimation Design

**Status:** Approved for implementation

**Date:** 2026-08-17

## Goal

Add a live, explicitly approximate CNY cost metric to Mission Control. The estimate uses provider-reported Token usage, the exact DeepSeek official model route recorded for each request, a versioned table of DeepSeek official USD prices, and a versioned USD/CNY reference rate. The feature must remain useful without runtime network access and must never present an estimate as an invoice or account balance.

## Scope

The first release prices only exact routes whose provider is `deepseek-official` and whose model ID appears in the bundled catalog. It supports the current official model IDs `deepseek-v4-flash` and `deepseek-v4-pro`. The HUD displays CNY as the primary unit and exposes the USD subtotal, price revision, exchange-rate revision, and coverage status in its detail text.

The feature covers the selected root Session and its Session-backed descendants already visible to Mission Control. Selecting an Agent applies the existing Agent filter to both Token totals and cost totals.

## Non-goals

- Actual billing, balance lookup, invoice reconciliation, tax, discounts, promotional credits, or currency settlement
- Runtime scraping or downloading of pricing or exchange rates
- Pricing aliases, gateways, third-party providers, or user-defined model routes
- Historical playback or cross-Session accounting
- Estimating Token counts that the provider did not report

## Versioned price catalog

Create a small immutable catalog module owned by the plugin. Each release entry contains:

- exact provider and model IDs;
- USD prices per one million cache-hit input, cache-miss input, and output Tokens;
- the catalog revision and date on which the official page was checked;
- the DeepSeek official pricing URL;
- the USD/CNY reference rate, its effective date, and its People's Bank of China or CFETS source URL.

The initial model prices come from the DeepSeek official Models & Pricing page checked on 2026-08-17:

| Model | Cache-hit input | Cache-miss input | Output |
| --- | ---: | ---: | ---: |
| `deepseek-v4-flash` | USD 0.0028 / 1M | USD 0.14 / 1M | USD 0.28 / 1M |
| `deepseek-v4-pro` | USD 0.003625 / 1M | USD 0.435 / 1M | USD 0.87 / 1M |

DeepSeek does not publish a separate cache-write charge. The catalog therefore records cache-write price as zero for these official routes and documents that provider behavior. A nonzero cache-write count remains visible in the Token HUD.

At release time, the maintainer records the most recent PBC/CFETS USD/CNY central parity available on a business day. The plugin never fetches a new rate at startup. Updating either official prices or the reference rate requires a catalog change, tests, documentation, and a plugin release.

## Authoritative usage fold

Cost must be attributed per completed model step rather than multiplying the Session's cumulative Token projection by its latest model. This preserves correctness when a Session changes models.

For each Session log, a pure fold:

1. tracks the active `turn` and `step` from `step/start`;
2. associates the next `request/header` provider/model route with that step;
3. reads provider usage from `assistant/chunk` usage chunks and finalized `assistant/message` events;
4. replaces an earlier usage sample for the same turn and step with the later sample instead of double counting it;
5. prices the final sample only when its exact route exists in the catalog.

For one priced sample, the USD estimate is:

```text
(cacheReadTokens × cacheHitUsdPerMillion
 + uncachedInputTokens × cacheMissUsdPerMillion
 + outputTokens × outputUsdPerMillion
 + cacheWriteTokens × cacheWriteUsdPerMillion) / 1,000,000
```

The CNY estimate is the USD estimate multiplied by the bundled USD/CNY reference rate. Calculations use JavaScript numbers internally and preserve the unrounded subtotal; rounding occurs only for display.

The initial SSE snapshot folds the existing Session logs. Live Session events update the same state machine incrementally. This keeps snapshot and live behavior identical and avoids assigning earlier usage to a newly selected model.

## Coverage and failure behavior

Each Agent cost result contains the known USD and CNY subtotal, priced Token usage, and an unpriced step count. The aggregate contains the sum across visible Agents and the sum of unpriced steps.

- Full coverage: show the CNY estimate with an `估算` label.
- Partial coverage: show the known subtotal and `部分估算`; the detail states how many model steps were excluded.
- No priced steps: show `暂无报价` rather than `¥0`.
- A usage event without a recorded provider/model route is unpriced and increments coverage diagnostics.
- Unknown providers or model IDs never fall back to another model's price.
- Malformed durable usage remains the Session/token-meter owner's error; Mission Control does not invent replacement values.

The price catalog is validated by tests at build time. A missing reference rate or duplicate route is a development error, not a runtime fallback.

## Protocol and UI

Add a cost estimate to every `AgentView` and to the aggregate snapshot/update messages. The browser protocol validates all monetary values as finite, nonnegative numbers and validates the catalog metadata as nonempty strings and ISO dates. Cost updates travel with the same ordered viewing epoch as Token updates, so an older generation cannot overwrite the current Session.

The global HUD adds one prominent metric after total Tokens:

```text
预估费用  ≈ ¥0.012345
```

The formatter uses `zh-CN` CNY notation, at least two and at most six fractional digits, retaining enough precision for small requests. Full and partial estimates include the approximation mark. The accessible label and detail text include:

- `仅为估算，不是实际账单`;
- USD subtotal;
- exact model prices used;
- DeepSeek price check date;
- USD/CNY reference rate and effective date;
- excluded-step count when coverage is partial.

English locale text uses `Estimated cost`, CNY as the primary display currency, and the same metadata. The Agent graph and Tool stream remain unchanged.

## Privacy and lifecycle

Cost estimation consumes only request route metadata and provider-reported usage already stored in the Session log. It does not read prompts, Tool payloads, hidden reasoning text, credentials, account balances, or billing APIs. It adds no network request and no persistence file.

All live listeners and per-view cost state follow the existing Mission Control subscription lifecycle. Closing the overlay, changing Session, disconnecting SSE, or unloading the plugin releases the state with the rest of the viewing epoch.

## Testing

Pure unit tests cover:

- both official model price entries and the version/reference metadata;
- exact cache-hit, cache-miss, output, and cache-write arithmetic;
- replacement of a usage chunk by finalized usage for the same step;
- two steps using different models in one Session;
- unknown providers, unknown models, missing routes, partial coverage, and no coverage;
- root plus child aggregation and selected-Agent filtering;
- protocol rejection of negative, nonfinite, or malformed cost values;
- CNY formatting at zero, sub-cent, ordinary, and large values.

Host snapshot and runtime tests prove replay/live parity. Dashboard tests prove full, partial, and unavailable labels plus accessible detail text. Package tests continue to prove that both Node and browser bundles ship. The release gate remains `pnpm run verify:release`, followed by a clean-profile DSH Web smoke test.

## Documentation and release process

README files document the estimate formula, supported routes, price and exchange-rate sources, revision dates, partial coverage, and the distinction from actual billing. The release checklist requires maintainers to visit the official DeepSeek pricing page and the PBC/CFETS rate source, compare every catalog field, update dates and values, and add a changelog note when a catalog value changes.
