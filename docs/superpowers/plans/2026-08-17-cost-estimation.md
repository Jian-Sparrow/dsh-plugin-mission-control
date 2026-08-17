# Mission Control Cost Estimation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline, versioned CNY cost estimate for DeepSeek official model usage to the live Mission Control HUD.

**Architecture:** A pure host-side tracker associates each provider-reported usage sample with the `request/header` route for its model step, replaces duplicate chunk/final samples, and prices only exact catalog matches. Snapshot and live paths publish per-Agent and aggregate estimates through the existing ordered SSE protocol; the browser filters them with the current Agent selection and renders an explicitly approximate CNY metric with source metadata.

**Tech Stack:** Node `^22.19.0 || >=24.0.0`, pnpm `11.7.0`, TypeScript ESM, Cordis, DeepSeek Harness `0.1.0-rc.6`, React 18, Zod, Vitest, Testing Library.

## Global Constraints

- Price only provider `deepseek-official` with exact model IDs `deepseek-v4-flash` and `deepseek-v4-pro`.
- Bundle the DeepSeek USD prices checked on 2026-08-17; never fetch pricing at runtime.
- Bundle `1 USD = 6.7894 CNY`, effective 2026-07-31; never fetch exchange rates at runtime.
- Call every amount an estimate; never present it as a bill, balance, credit usage, tax amount, or settlement value.
- Attribute usage per `turn`/`step` route so a model switch never reprices earlier usage.
- Replace an early usage chunk with the finalized usage for the same `turn`/`step`; never double count it.
- Unknown providers, unknown models, and missing routes remain unpriced; never fall back to another price or to zero-cost coverage.
- Use only logged route metadata and provider-reported usage; do not inspect prompts, hidden reasoning, credentials, or account APIs.
- Keep current Session, descendant, viewing-epoch, SSE ordering, bounded-memory, and disposal behavior unchanged.
- Maintain English and Simplified Chinese UI/documentation together.

---

## Repository file map

- `src/pricing.ts`: immutable official price/reference metadata and exact route lookup.
- `src/host/cost.ts`: pure per-Session step tracker, pricing arithmetic, replacement semantics, and aggregation.
- `src/protocol.ts`: browser-visible cost types and closed Zod wire validation.
- `src/host/snapshot.ts`: initial per-Agent and aggregate cost fold from existing Session logs.
- `src/host/runtime.ts`: incremental cost tracking and coalesced cost/token publication.
- `src/client/store.ts`: generation-checked cost reduction and Agent-filtered visible estimate.
- `src/client/cost-format.ts`: pure CNY/USD and coverage formatting.
- `src/client/components/GlobalHud.tsx`: estimated-cost metric and accessible details.
- `src/client/locales.ts`, `src/client/styles.ts`: bilingual labels and layout.
- `tests/pricing.spec.ts`, `tests/host/cost.spec.ts`: catalog and pure cost-fold behavior.
- `tests/protocol.spec.ts`, `tests/host/snapshot.spec.ts`, `tests/host/runtime.spec.ts`: wire and host integration.
- `tests/client/store.spec.ts`, `tests/client/cost-format.spec.ts`, `tests/client/dashboard.spec.tsx`: browser state and UI behavior.
- `README.md`, `README.zh.md`, `package.json`: consumer contract and correct GitHub metadata.

### Task 1: Versioned catalog and pure per-step cost tracker

**Files:**
- Create: `src/pricing.ts`
- Create: `src/host/cost.ts`
- Create: `tests/pricing.spec.ts`
- Create: `tests/host/cost.spec.ts`

**Interfaces:**
- Produces: `PricingMetadata`, `ModelPrice`, `PricingCatalog`, `DEEPSEEK_PRICING`, `findModelPrice(provider, model)`.
- Consumes: the existing `TokenBuckets` type from `src/protocol.ts`.
- Produces: `CostBreakdown`, `CostEstimate`, `CostTracker`, `createCostTracker(events)`, `applyCostEvent(tracker, event)`, `estimateCost(tracker)`, and `addCostEstimates(values)`.

- [ ] **Step 1: Write the failing catalog tests**

Create `tests/pricing.spec.ts` with exact official values and exact-match behavior:

```ts
import { describe, expect, it } from 'vitest'
import { DEEPSEEK_PRICING, findModelPrice } from '../src/pricing.ts'

describe('DeepSeek pricing catalog', () => {
  it('ships the checked official V4 prices and CNY reference rate', () => {
    expect(DEEPSEEK_PRICING.metadata).toMatchObject({
      revision: 'deepseek-2026-08-17',
      priceCheckedAt: '2026-08-17',
      usdToCny: 6.7894,
      fxEffectiveAt: '2026-07-31',
    })
    expect(findModelPrice('deepseek-official', 'deepseek-v4-flash')).toMatchObject({
      cacheHitUsdPerMillion: 0.0028,
      cacheMissUsdPerMillion: 0.14,
      outputUsdPerMillion: 0.28,
      cacheWriteUsdPerMillion: 0,
    })
    expect(findModelPrice('deepseek-official', 'deepseek-v4-pro')).toMatchObject({
      cacheHitUsdPerMillion: 0.003625,
      cacheMissUsdPerMillion: 0.435,
      outputUsdPerMillion: 0.87,
      cacheWriteUsdPerMillion: 0,
    })
  })

  it('does not price aliases or other providers', () => {
    expect(findModelPrice('deepseek-official', 'deepseek-chat')).toBeUndefined()
    expect(findModelPrice('gateway', 'deepseek-v4-pro')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the catalog test and verify RED**

Run `pnpm vitest run tests/pricing.spec.ts`.

Expected: FAIL because `src/pricing.ts` does not exist.

- [ ] **Step 3: Implement the immutable catalog**

Create `src/pricing.ts` with these public records and values:

```ts
export interface PricingMetadata {
  readonly revision: 'deepseek-2026-08-17'
  readonly priceCheckedAt: '2026-08-17'
  readonly priceSource: 'https://api-docs.deepseek.com/quick_start/pricing'
  readonly usdToCny: 6.7894
  readonly fxEffectiveAt: '2026-07-31'
  readonly fxSource: 'https://fec.mofcom.gov.cn/article/zyfw/jrfw/jrfwywzn/jrfwwh/hlfxglzy/202607/7208.html'
}

export interface ModelPrice {
  readonly provider: 'deepseek-official'
  readonly model: 'deepseek-v4-flash' | 'deepseek-v4-pro'
  readonly cacheHitUsdPerMillion: number
  readonly cacheMissUsdPerMillion: number
  readonly outputUsdPerMillion: number
  readonly cacheWriteUsdPerMillion: 0
}

export interface PricingCatalog {
  readonly metadata: PricingMetadata
  readonly models: readonly ModelPrice[]
}

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
    Object.freeze({ provider: 'deepseek-official', model: 'deepseek-v4-flash', cacheHitUsdPerMillion: 0.0028, cacheMissUsdPerMillion: 0.14, outputUsdPerMillion: 0.28, cacheWriteUsdPerMillion: 0 }),
    Object.freeze({ provider: 'deepseek-official', model: 'deepseek-v4-pro', cacheHitUsdPerMillion: 0.003625, cacheMissUsdPerMillion: 0.435, outputUsdPerMillion: 0.87, cacheWriteUsdPerMillion: 0 }),
  ]),
})

export function findModelPrice(provider: string, model: string): ModelPrice | undefined {
  return DEEPSEEK_PRICING.models.find(entry => entry.provider === provider && entry.model === model)
}
```

- [ ] **Step 4: Run the catalog test and verify GREEN**

Run `pnpm vitest run tests/pricing.spec.ts`.

Expected: 2 tests PASS.

- [ ] **Step 5: Write failing per-step tracker tests**

Create `tests/host/cost.spec.ts`. Use real event objects and cover arithmetic, replacement, switching, and missing coverage:

```ts
import { describe, expect, it } from 'vitest'
import { createCostTracker, estimateCost } from '../../src/host/cost.ts'

const step = (turn: number, index: number, provider: string, model: string, usage: object) => [
  { type: 'step/start', data: { turn, step: index }, time: 1 },
  { type: 'request/header', data: { header: { config: { provider, model } }, reason: 'initial' }, time: 2 },
  { type: 'assistant/message', data: { turn, step: index, message: { role: 'assistant', content: [] }, usage }, time: 3 },
]

describe('cost tracker', () => {
  it('prices every official bucket and converts the unrounded subtotal to CNY', () => {
    const usage = { inputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000, outputTokens: 1_000_000 }
    const estimate = estimateCost(createCostTracker(step(1, 1, 'deepseek-official', 'deepseek-v4-flash', usage)))
    expect(estimate.usd).toBeCloseTo(0.4228)
    expect(estimate.cny).toBeCloseTo(0.4228 * 6.7894)
    expect(estimate).toMatchObject({ pricedSteps: 1, unpricedSteps: 0 })
  })

  it('replaces an early usage chunk with finalized usage for the same step', () => {
    const events = [
      { type: 'step/start', data: { turn: 1, step: 1 }, time: 1 },
      { type: 'request/header', data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } }, reason: 'initial' }, time: 2 },
      { type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 0, outputTokens: 500_000 } } }, time: 3 },
      { type: 'assistant/message', data: { turn: 1, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: 0, outputTokens: 1_000_000 } }, time: 4 },
    ]
    expect(estimateCost(createCostTracker(events)).usd).toBeCloseTo(0.28)
  })

  it('prices model switches per step', () => {
    const usage = { inputTokens: 0, outputTokens: 1_000_000 }
    const estimate = estimateCost(createCostTracker([
      ...step(1, 1, 'deepseek-official', 'deepseek-v4-flash', usage),
      ...step(1, 2, 'deepseek-official', 'deepseek-v4-pro', usage),
    ]))
    expect(estimate.usd).toBeCloseTo(1.15)
    expect(estimate.breakdown.map(row => row.model)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
  })

  it('marks unknown and missing routes as unpriced instead of free', () => {
    const usage = { inputTokens: 1_000, outputTokens: 1_000 }
    const estimate = estimateCost(createCostTracker([
      ...step(1, 1, 'gateway', 'deepseek-v4-pro', usage),
      { type: 'step/start', data: { turn: 1, step: 2 }, time: 4 },
      { type: 'assistant/message', data: { turn: 1, step: 2, message: { role: 'assistant', content: [] }, usage }, time: 5 },
    ]))
    expect(estimate).toMatchObject({ usd: 0, cny: 0, pricedSteps: 0, unpricedSteps: 2, breakdown: [] })
  })
})
```

- [ ] **Step 6: Run tracker tests and verify RED**

Run `pnpm vitest run tests/host/cost.spec.ts`.

Expected: FAIL because `src/host/cost.ts` does not exist.

- [ ] **Step 7: Implement the tracker and aggregation API**

Create `src/host/cost.ts` with these public types and operations:

```ts
export interface CostBreakdown {
  readonly provider: string
  readonly model: string
  readonly price: ModelPrice
  readonly tokens: TokenBuckets
  readonly usd: number
  readonly cny: number
}

export interface CostEstimate {
  readonly usd: number
  readonly cny: number
  readonly pricedSteps: number
  readonly unpricedSteps: number
  readonly breakdown: readonly CostBreakdown[]
}

export interface CostTracker {
  currentStep?: string
  readonly routes: Map<string, { provider: string; model: string }>
  readonly samples: Map<string, { tokens: TokenBuckets; price?: ModelPrice }>
}

export function createCostTracker(events: readonly unknown[] = []): CostTracker
export function applyCostEvent(tracker: CostTracker, event: unknown): boolean
export function estimateCost(tracker: CostTracker): CostEstimate
export function addCostEstimates(values: Iterable<CostEstimate>): CostEstimate
```

Import `TokenBuckets` from `src/protocol.ts` with `import type`. Parse only safe nonnegative integer usage fields. Treat absent cache fields as zero. Use `turn:step` as the stable sample key, replace `samples.get(key)` on every later usage record for that key, return `true` only when a usage sample changes, group breakdown rows by exact `provider:model`, retain the exact `ModelPrice` on each priced breakdown row, and sort breakdown rows lexically for deterministic wire output.

- [ ] **Step 8: Run Task 1 tests and typecheck**

```bash
pnpm vitest run tests/pricing.spec.ts tests/host/cost.spec.ts
pnpm run typecheck
```

Expected: 6 tests PASS and typecheck exits 0.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/pricing.ts src/host/cost.ts tests/pricing.spec.ts tests/host/cost.spec.ts
git commit -m "feat: calculate versioned DeepSeek costs"
```

### Task 2: Cost-aware wire protocol and initial snapshot

**Files:**
- Modify: `src/protocol.ts`
- Modify: `src/host/snapshot.ts`
- Modify: `tests/protocol.spec.ts`
- Modify: `tests/host/snapshot.spec.ts`
- Modify: every test fixture that constructs `AgentView` or `MissionSnapshot`

**Interfaces:**
- Consumes: `PricingMetadata`, `DEEPSEEK_PRICING`, `CostEstimate`, `createCostTracker(events)`, `estimateCost(tracker)`, `addCostEstimates(values)`.
- Produces: `AgentView.cost`, `MissionSnapshot.cost`, `MissionSnapshot.pricing`, and cost fields on `token/update`.

- [ ] **Step 1: Write failing protocol tests**

Extend `tests/protocol.spec.ts` with a valid cost fixture and two rejection cases:

```ts
const flashPrice = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  cacheHitUsdPerMillion: 0.0028,
  cacheMissUsdPerMillion: 0.14,
  outputUsdPerMillion: 0.28,
  cacheWriteUsdPerMillion: 0,
} as const

const pricing = {
  revision: 'deepseek-2026-08-17',
  priceCheckedAt: '2026-08-17',
  priceSource: 'https://api-docs.deepseek.com/quick_start/pricing',
  usdToCny: 6.7894,
  fxEffectiveAt: '2026-07-31',
  fxSource: 'https://fec.mofcom.gov.cn/article/zyfw/jrfw/jrfwywzn/jrfwwh/hlfxglzy/202607/7208.html',
} as const

const cost = {
  usd: 0.1,
  cny: 0.67894,
  pricedSteps: 1,
  unpricedSteps: 0,
  breakdown: [{
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    price: flashPrice,
    tokens: { uncachedInputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    usd: 0.1,
    cny: 0.67894,
  }],
}

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  type: 'snapshot' as const,
  subscriptionId: 's1',
  generation: 1,
  snapshot: {
    rootId: 'root',
    agents: [],
    tools: [],
    totals: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    cost,
    pricing,
    diagnostics: 0,
    ...overrides,
  },
})

it('accepts a complete valid cost snapshot', () => {
  const message = snapshot({ cost, pricing })
  expect(parseMissionMessage(message)).toEqual(message)
})

it('rejects negative or nonfinite estimates', () => {
  expect(() => parseMissionMessage(snapshot({ cost: { ...cost, cny: -1 } }))).toThrow()
  expect(() => parseMissionMessage(snapshot({ cost: { ...cost, usd: Number.POSITIVE_INFINITY } }))).toThrow()
})

it('rejects malformed catalog metadata', () => {
  expect(() => parseMissionMessage(snapshot({ pricing: { ...pricing, priceCheckedAt: 'today' } }))).toThrow()
})
```

- [ ] **Step 2: Run protocol tests and verify RED**

Run `pnpm vitest run tests/protocol.spec.ts`.

Expected: FAIL because the closed schema does not accept the new required fields.

- [ ] **Step 3: Extend wire types and strict schemas**

Import cost/catalog types with `import type`. Add `cost: CostEstimate` to `AgentView`; add `cost: CostEstimate` and `pricing: PricingMetadata` to `MissionSnapshot`; extend `token/update` with `cost: CostEstimate` and `totalCost: CostEstimate`.

Add strict schemas for `TokenBuckets`, `CostBreakdown`, `CostEstimate`, and `PricingMetadata`. Monetary values use `z.number().finite().nonnegative()`. Step counts use the existing nonnegative-integer schema. Date fields use `/^\d{4}-\d{2}-\d{2}$/`; source fields use `z.string().url()`; `usdToCny` is finite and positive.

- [ ] **Step 4: Update typed message fixtures and verify protocol GREEN**

Introduce shared local `zeroCost()` and `pricing()` fixture helpers rather than duplicating literals. Run `pnpm vitest run tests/protocol.spec.ts`.

Expected: all protocol tests PASS.

- [ ] **Step 5: Write failing snapshot cost tests**

Extend `tests/host/snapshot.spec.ts` so the root uses Flash, the child uses Pro, and an unknown descendant remains unpriced. Assert:

```ts
expect(snapshot.agents.find(agent => agent.id === 'root')?.cost).toMatchObject({ pricedSteps: 1, unpricedSteps: 0 })
expect(snapshot.agents.find(agent => agent.id === 'child')?.cost).toMatchObject({ pricedSteps: 1, unpricedSteps: 0 })
expect(snapshot.agents.find(agent => agent.id === 'unknown')?.cost).toMatchObject({ pricedSteps: 0, unpricedSteps: 1 })
expect(snapshot.cost.pricedSteps).toBe(2)
expect(snapshot.cost.unpricedSteps).toBe(1)
expect(snapshot.pricing).toEqual(DEEPSEEK_PRICING.metadata)
```

- [ ] **Step 6: Run snapshot tests and verify RED**

Run `pnpm vitest run tests/host/snapshot.spec.ts`.

Expected: FAIL because `snapshotMission()` does not fold costs.

- [ ] **Step 7: Fold per-Agent and aggregate snapshot costs**

Inside `snapshotMission()`, compute one cost before constructing each Agent:

```ts
const cost = estimateCost(createCostTracker(session.events))
agents.push({
  id: session.id,
  ...(session.id === rootId ? {} : { parentId: session.header.parentSession }),
  label: readLabel(projection) ?? session.id,
  local: agent !== undefined,
  startedAt: session.header.createdAt,
  status: initialStatus(agent),
  tokens,
  cost,
})
costs.push(cost)
```

Return:

```ts
return {
  rootId,
  agents,
  tools,
  totals,
  cost: addCostEstimates(costs),
  pricing: DEEPSEEK_PRICING.metadata,
  diagnostics: 0,
}
```

- [ ] **Step 8: Run focused tests and typecheck**

```bash
pnpm vitest run tests/protocol.spec.ts tests/host/snapshot.spec.ts
pnpm run typecheck
```

Expected: focused tests PASS and typecheck exits 0.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/protocol.ts src/host/snapshot.ts tests/protocol.spec.ts tests/host/snapshot.spec.ts tests/client/store.spec.ts tests/client/dashboard.spec.tsx
git commit -m "feat: publish cost estimates in mission snapshots"
```

### Task 3: Incremental host runtime pricing

**Files:**
- Modify: `src/host/runtime.ts`
- Modify: `tests/host/runtime.spec.ts`

**Interfaces:**
- Consumes: `CostTracker`, `createCostTracker`, `applyCostEvent`, `estimateCost`, `addCostEstimates`.
- Produces: coalesced `token/update` frames containing the current Session estimate and aggregate estimate.

- [ ] **Step 1: Write failing live replacement and model-switch tests**

Extend the runtime test fake with `emitEvent(sessionId, event)` and add:

```ts
const stepStart = (turn: number, step: number) => ({
  type: 'step/start', time: step, data: { turn, step },
})
const requestHeader = (provider: string, model: string) => ({
  type: 'request/header', time: 10, data: { header: { config: { provider, model } }, reason: 'change' },
})
const usageChunk = (turn: number, step: number, usage: object) => ({
  type: 'assistant/chunk', time: 20, data: { turn, step, chunk: { type: 'usage', usage } },
})
const assistantUsage = (turn: number, step: number, usage: object) => ({
  type: 'assistant/message', time: 30, data: { turn, step, message: { role: 'assistant', content: [] }, usage },
})

it('publishes a finalized step cost once and replaces an earlier usage chunk', async () => {
  const { runtime, services, messages } = harness()
  runtime.open('root', 1, { send: message => messages.push(message) })
  services.emitEvent('root', stepStart(1, 1))
  services.emitEvent('root', requestHeader('deepseek-official', 'deepseek-v4-flash'))
  services.emitEvent('root', usageChunk(1, 1, { inputTokens: 0, outputTokens: 500_000 }))
  services.emitEvent('root', assistantUsage(1, 1, { inputTokens: 0, outputTokens: 1_000_000 }))
  await vi.advanceTimersByTimeAsync(250)
  const update = messages.findLast(message => message.type === 'token/update')
  expect(update?.cost.usd).toBeCloseTo(0.28)
})

it('keeps earlier Flash cost when a later step switches to Pro', async () => {
  const { runtime, services, messages } = harness()
  runtime.open('root', 1, { send: message => messages.push(message) })
  services.emitEvent('root', stepStart(1, 1))
  services.emitEvent('root', requestHeader('deepseek-official', 'deepseek-v4-flash'))
  services.emitEvent('root', assistantUsage(1, 1, { inputTokens: 0, outputTokens: 1_000_000 }))
  services.emitEvent('root', stepStart(1, 2))
  services.emitEvent('root', requestHeader('deepseek-official', 'deepseek-v4-pro'))
  services.emitEvent('root', assistantUsage(1, 2, { inputTokens: 0, outputTokens: 1_000_000 }))
  await vi.advanceTimersByTimeAsync(250)
  const update = messages.findLast(message => message.type === 'token/update')
  expect(update?.cost.usd).toBeCloseTo(1.15)
})
```

- [ ] **Step 2: Run runtime tests and verify RED**

Run `pnpm vitest run tests/host/runtime.spec.ts`.

Expected: FAIL because live records do not hold or publish cost trackers.

- [ ] **Step 3: Add cost state to every subscription**

Add to `SubscriptionRecord`:

```ts
readonly costTrackers: Map<string, CostTracker>
readonly costs: Map<string, CostEstimate>
pendingCost: Set<string>
```

At `open()`, build trackers from every included live Session's `events`, derive `costs`, and preserve the snapshot values. At `sessionCreated`, initialize the new descendant tracker from its existing events. At `close()`, clear `pendingCost` with the existing pending Token set.

- [ ] **Step 4: Apply every Session event to its tracker**

At the start of `onSessionEvent()` for an included Session:

```ts
const tracker = record.costTrackers.get(session.id)
if (tracker !== undefined && applyCostEvent(tracker, event)) {
  const cost = estimateCost(tracker)
  record.costs.set(session.id, cost)
  const agent = record.agents.get(session.id)
  if (agent !== undefined) record.agents.set(session.id, { ...agent, cost })
  record.pendingCost.add(session.id)
  this.armTokenTimer(record)
}
```

Do this before Tool/turn branching so `step/start`, `request/header`, usage chunks, and finalized messages all reach the tracker.

- [ ] **Step 5: Extend the coalesced update**

In the timer callback, iterate over the union of `pendingTokens` and `pendingCost`. For every affected Session send:

```ts
{
  type: 'token/update',
  tokens,
  totals,
  cost,
  totalCost: addCostEstimates(record.costs.values()),
}
```

Clear both pending sets after publishing. Extend `FrameBody` with `cost` and `totalCost`.

- [ ] **Step 6: Test descendant aggregation and disposal**

Add one runtime assertion that a newly created Session-backed child contributes to `totalCost`, and extend the existing close/dispose test to assert no cost frame is sent after close even when a usage event arrives.

- [ ] **Step 7: Run host tests and typecheck**

```bash
pnpm vitest run tests/host/cost.spec.ts tests/host/snapshot.spec.ts tests/host/runtime.spec.ts
pnpm run typecheck
```

Expected: all focused host tests PASS and typecheck exits 0.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/host/runtime.ts tests/host/runtime.spec.ts
git commit -m "feat: stream live mission costs"
```

### Task 4: Agent-filtered browser state and CNY HUD

**Files:**
- Create: `src/client/cost-format.ts`
- Create: `tests/client/cost-format.spec.ts`
- Modify: `src/client/store.ts`
- Modify: `src/client/components/GlobalHud.tsx`
- Modify: `src/client/locales.ts`
- Modify: `src/client/styles.ts`
- Modify: `tests/client/store.spec.ts`
- Modify: `tests/client/dashboard.spec.tsx`

**Interfaces:**
- Produces: `MissionStoreSnapshot.visibleCost`.
- Produces: `costCoverage(cost)`, `formatCny(cost)`, and `formatUsd(cost)`.
- Renders: full, partial, and unavailable estimated-cost HUD states.

- [ ] **Step 1: Write failing cost formatter tests**

Create `tests/client/cost-format.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { costCoverage, formatCny, formatUsd } from '../../src/client/cost-format.ts'

describe('cost formatting', () => {
  it('preserves useful precision for small CNY estimates', () => {
    expect(formatCny({ cny: 0.0000014 })).toBe('¥0.000001')
    expect(formatCny({ cny: 12.34567 })).toBe('¥12.34567')
  })

  it('classifies complete, partial, and unavailable coverage', () => {
    expect(costCoverage({ pricedSteps: 1, unpricedSteps: 0 })).toBe('full')
    expect(costCoverage({ pricedSteps: 1, unpricedSteps: 2 })).toBe('partial')
    expect(costCoverage({ pricedSteps: 0, unpricedSteps: 2 })).toBe('unavailable')
  })

  it('formats the USD source subtotal independently', () => {
    expect(formatUsd({ usd: 0.123456 })).toBe('$0.123456')
  })
})
```

- [ ] **Step 2: Run formatter tests and verify RED**

Run `pnpm vitest run tests/client/cost-format.spec.ts`.

Expected: FAIL because `src/client/cost-format.ts` does not exist.

- [ ] **Step 3: Implement pure formatting**

Use `Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 6 })` for the HUD and `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 6 })` for the source subtotal. Export:

```ts
export type CostCoverage = 'full' | 'partial' | 'unavailable'
export function costCoverage(cost: Pick<CostEstimate, 'pricedSteps' | 'unpricedSteps'>): CostCoverage
export function formatCny(cost: Pick<CostEstimate, 'cny'>): string
export function formatUsd(cost: Pick<CostEstimate, 'usd'>): string
```

- [ ] **Step 4: Write failing browser-store cost tests**

Extend the snapshot fixture in `tests/client/store.spec.ts` with different root/child costs. Assert global cost initially, selected child cost after `selectAgent('child')`, restored aggregate after `selectAgent(undefined)`, and cost replacement after a `token/update` frame:

```ts
const childReplacement = { ...zeroCost(), cny: 0.5, usd: 0.07, pricedSteps: 1 }
const totalReplacement = { ...zeroCost(), cny: 1.5, usd: 0.21, pricedSteps: 2 }
expect(store.getSnapshot().visibleCost.cny).toBeCloseTo(snapshot.cost.cny)
store.selectAgent('child')
expect(store.getSnapshot().visibleCost).toEqual(snapshot.agents[1]!.cost)
store.selectAgent(undefined)
expect(store.getSnapshot().visibleCost).toEqual(snapshot.cost)
store.receive(tokenUpdate({ cost: childReplacement, totalCost: totalReplacement }))
expect(store.getSnapshot().visibleCost).toEqual(totalReplacement)
```

Change the existing `tokenUpdate` test helper to accept `{ cost, totalCost }` and include both fields on the returned frame. Add a local `zeroCost()` fixture returning `{ usd: 0, cny: 0, pricedSteps: 0, unpricedSteps: 0, breakdown: [] }`.

- [ ] **Step 5: Run store tests and verify RED**

Run `pnpm vitest run tests/client/store.spec.ts`.

Expected: FAIL because `visibleCost` and cost reduction do not exist.

- [ ] **Step 6: Add visible cost reduction**

Add `visibleCost: CostEstimate` to `MissionStoreSnapshot` and a shared `ZERO_COST`. In `reduceFrame()` update both the matching Agent's `cost` and snapshot `cost` for `token/update`. In `replace()` assign `selected?.cost ?? next.mission?.cost ?? ZERO_COST`, exactly parallel to `visibleTotals`.

- [ ] **Step 7: Write failing HUD coverage tests**

Extend `tests/client/dashboard.spec.tsx`:

```ts
const zeroCost = (): CostEstimate => ({ usd: 0, cny: 0, pricedSteps: 0, unpricedSteps: 0, breakdown: [] })
const flashBreakdown: CostBreakdown = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  price: {
    provider: 'deepseek-official', model: 'deepseek-v4-flash',
    cacheHitUsdPerMillion: 0.0028, cacheMissUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28, cacheWriteUsdPerMillion: 0,
  },
  tokens: { uncachedInputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  usd: 0.14,
  cny: 0.950516,
}
const complete = { ...zeroCost(), usd: 0.14, cny: 0.950516, pricedSteps: 1, breakdown: [flashBreakdown] }
const { props } = bench('full', { ...snapshot, cost: complete })
const view = render(<MissionDashboard {...props} />)
expect(view.getByText('≈ ¥0.950516')).toBeTruthy()
expect(view.getByText('Estimate only, not an actual bill')).toBeTruthy()
expect(view.getByText('$0.140000')).toBeTruthy()
expect(view.getByText(/1 USD = 6.7894 CNY/)).toBeTruthy()
expect(view.getByText(/2026-08-17/)).toBeTruthy()
expect(view.getByText(/2026-07-31/)).toBeTruthy()

const partial = { ...complete, unpricedSteps: 2 }
const partialView = render(<MissionDashboard {...bench('full', { ...snapshot, cost: partial }).props} />)
expect(partialView.getByText('Partial estimate')).toBeTruthy()
expect(partialView.getByText('2 model steps excluded')).toBeTruthy()

const unavailable = { ...zeroCost(), unpricedSteps: 1 }
const unavailableView = render(<MissionDashboard {...bench('full', { ...snapshot, cost: unavailable }).props} />)
expect(unavailableView.getByText('No price')).toBeTruthy()
```

Split the three coverage assertions into separate tests so each render has an isolated DOM. Change `bench` to accept `mission: MissionSnapshot = snapshot` and pass that value in its snapshot message.

- [ ] **Step 8: Run dashboard tests and verify RED**

Run `pnpm vitest run tests/client/dashboard.spec.tsx`.

Expected: FAIL because the HUD has no cost metric or details.

- [ ] **Step 9: Render the estimated-cost metric and details**

In `GlobalHud`, derive coverage from `state.visibleCost`. Render a prominent `.mc-cost` block after total Tokens. For full coverage show `估算`/`Estimate`; for partial coverage show `部分估算`/`Partial estimate`; for no priced steps show `暂无报价`/`No price` and omit the approximation mark.

Use a native `<details>` with a translated `<summary>`. Its content must render the `仅为估算，不是实际账单` warning, USD subtotal, `1 USD = 6.7894 CNY`, price check date, exchange-rate effective date, excluded-step count, and one row per `breakdown` item containing provider/model, Token buckets, USD subtotal, and catalog unit prices.

- [ ] **Step 10: Add bilingual copy and styles**

Add these exact locale values, using the existing namespace prefix convention:

```ts
// English
'hud.estimatedCost': 'Estimated cost',
'hud.estimate': 'Estimate',
'hud.partialEstimate': 'Partial estimate',
'hud.noPrice': 'No price',
'hud.costDetails': 'Cost estimate details',
'hud.notBill': 'Estimate only, not an actual bill',
'hud.usdSubtotal': 'USD subtotal',
'hud.exchangeRate': 'Reference rate: 1 USD = {rate} CNY',
'hud.priceCheckedAt': 'Prices checked {date}',
'hud.fxEffectiveAt': 'Reference rate effective {date}',
'hud.unpricedSteps': '{count} model steps excluded',
'hud.modelPrice': '{model} unit prices',

// Simplified Chinese
'hud.estimatedCost': '预估费用',
'hud.estimate': '估算',
'hud.partialEstimate': '部分估算',
'hud.noPrice': '暂无报价',
'hud.costDetails': '费用估算详情',
'hud.notBill': '仅为估算，不是实际账单',
'hud.usdSubtotal': '美元小计',
'hud.exchangeRate': '参考汇率：1 USD = {rate} CNY',
'hud.priceCheckedAt': '价格核对日期：{date}',
'hud.fxEffectiveAt': '参考汇率生效日期：{date}',
'hud.unpricedSteps': '{count} 个模型步骤未计价',
'hud.modelPrice': '{model} 单价',
```

Style `.mc-cost` and its native `<details>` to fit the existing HUD grid, retain keyboard focus indication, and wrap long model IDs without horizontal overflow.

- [ ] **Step 11: Run browser tests and typecheck**

```bash
pnpm vitest run tests/client/cost-format.spec.ts tests/client/store.spec.ts tests/client/dashboard.spec.tsx
pnpm run typecheck
```

Expected: all focused browser tests PASS and typecheck exits 0.

- [ ] **Step 12: Commit Task 4**

```bash
git add src/client tests/client
git commit -m "feat: show estimated CNY cost in mission HUD"
```

### Task 5: Consumer documentation, release metadata, and full verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `package.json`
- Test: `tests/package/packed-plugin.spec.ts`

**Interfaces:**
- Documents: supported routes, formula, catalog values, reference rate, coverage states, and release update procedure.
- Corrects: GitHub metadata to `Jian-Sparrow/dsh-plugin-mission-control`.

- [ ] **Step 1: Write the failing package metadata assertion**

Extend `tests/package/packed-plugin.spec.ts`:

```ts
expect(manifest.repository.url).toBe('git+https://github.com/Jian-Sparrow/dsh-plugin-mission-control.git')
expect(manifest.bugs.url).toBe('https://github.com/Jian-Sparrow/dsh-plugin-mission-control/issues')
expect(manifest.homepage).toBe('https://github.com/Jian-Sparrow/dsh-plugin-mission-control#readme')
```

- [ ] **Step 2: Run the packed-artifact test and verify RED**

Run `pnpm run build && pnpm vitest run tests/package/packed-plugin.spec.ts`.

Expected: FAIL because the manifest still names the former GitHub owner.

- [ ] **Step 3: Update package metadata**

Change `repository.url`, `bugs.url`, and `homepage` to the exact `Jian-Sparrow` values asserted above. Do not change package name, exports, DSH bundle metadata, or version in this feature commit.

- [ ] **Step 4: Update both README files**

Replace every statement that cost estimation is unsupported. Add matching English and Chinese sections containing these exact catalog facts:

```text
Flash: cache hit $0.0028/M, cache miss $0.14/M, output $0.28/M
Pro: cache hit $0.003625/M, cache miss $0.435/M, output $0.87/M
Reference conversion: 1 USD = 6.7894 CNY (2026-07-31)
```

Document the formula, exact `deepseek-official` route requirement, full/partial/unavailable coverage, model-switch attribution, cache-write price of zero, source URLs, check dates, and `仅为估算，不是实际账单`. Add a maintainer update checklist requiring price and exchange-rate verification before every release.

- [ ] **Step 5: Run the entire release gate**

```bash
pnpm run verify:release
pnpm pack --dry-run
git diff --check
```

Expected: typecheck and lint exit 0; all unit and package tests PASS; Node and browser bundles build; tarball includes runtime bundles, declarations, bundle patch, license, and both README files; diff check emits no output.

- [ ] **Step 6: Install the tarball into a clean DSH Web profile**

Run these exact setup commands:

```bash
MISSION_SMOKE_DIR="$(mktemp -d /private/tmp/dsh-mission-control-cost.XXXXXX)"
pnpm pack --pack-destination "$MISSION_SMOKE_DIR"
cd /Users/liujiansmac/Projects/deepseek-harness
DSH_HOME="$MISSION_SMOKE_DIR/home" pnpm dsh plugin --profile web add "$MISSION_SMOKE_DIR/dsh-plugin-mission-control-0.1.0.tgz"
DSH_HOME="$MISSION_SMOKE_DIR/home" pnpm dsh --profile web --dump-config
```

Verify the dumped composition contains the `mission-control` row. Start DSH Web with `DSH_HOME="$MISSION_SMOKE_DIR/home" pnpm dsh web --host 127.0.0.1 --port 0`, use the loopback URL printed by DSH, then verify:

- the client bundle responds with HTTP 200;
- Mission Control opens for a current Session;
- the sidebar Mission Control action is registered and disabled when no Session is selected;
- the tested HUD fixtures cover `≈ ¥...`, `部分估算`, and `暂无报价` without requiring a real API call;
- the browser console has no warnings or errors;
- closing the overlay releases the SSE connection.

- [ ] **Step 7: Commit Task 5**

```bash
git add README.md README.zh.md package.json tests/package/packed-plugin.spec.ts
git commit -m "docs: document mission cost estimates"
```

- [ ] **Step 8: Run final status and push readiness checks**

```bash
git status -sb
git log --oneline -7
git diff origin/codex/mission-control...HEAD --check
```

Expected: clean `codex/mission-control` worktree, five feature commits after the design/plan commits, and no whitespace errors. Do not publish to npm or create a GitHub release without separate user authorization.
