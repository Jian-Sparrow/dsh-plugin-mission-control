# Expandable Mission Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen Mission Control presentation that restores the original Agent topology plus simultaneous Tool stream while preserving the inline panel and its single live SSE subscription.

**Architecture:** Extend the existing observable controller with an `inline | fullscreen` presentation field that does not affect viewing generation. Keep `LiveMission`, `MissionStore`, and `MissionSource` mounted above presentation selection, and portal only the frame/dashboard to the inline host or `document.body`. Render the compact Agent tree/tabs inline and restore the D3 Agent graph plus side-by-side Tool stream only in full-screen mode.

**Tech Stack:** TypeScript ESM, React 18, ReactDOM Portal, D3 hierarchy, Cordis client slots, Vitest, Testing Library, jsdom, tsdown.

## Global Constraints

- Default presentation is `inline`; full-screen is entered only through the new Expand control.
- Expand and Restore must not increment generation, reconnect SSE, clear Tool rows, reset Agent selection, or retarget the Session.
- Full-screen uses a named modal dialog; inline uses a named region; `Escape` closes either presentation.
- Use only Harness rc.7's existing `sidebar.footer.action` and `ctx.layout.toggleSidebar()` integration.
- Do not register `shell.overlay` or reference `sidebar.auxiliary` or `openSidebar()`.
- Package version advances from `0.2.0` to `0.3.0`.

---

### Task 1: Presentation state in the controller

**Files:**
- Modify: `src/client/controller.ts`
- Test: `tests/client/store.spec.ts`

**Interfaces:**
- Produces: `MissionPresentation = 'inline' | 'fullscreen'`.
- Produces: open `ControllerSnapshot` with `presentation: MissionPresentation`.
- Produces: `MissionControlController.expand(): void` and `restore(): void`.
- Preserves: `toggle()`, `retarget()`, `close()`, and monotonic viewing generation.

- [ ] **Step 1: Write the failing presentation-state test**

Add a controller test that opens `root`, records generation, calls `expand()`, retargets to `child`, calls `restore()`, and asserts:

```ts
expect(controller.getSnapshot()).toEqual({
  open: true,
  sessionId: 'root',
  generation: 1,
  presentation: 'inline',
})
controller.expand()
expect(controller.getSnapshot()).toMatchObject({ generation: 1, presentation: 'fullscreen' })
controller.retarget('child')
expect(controller.getSnapshot()).toMatchObject({
  sessionId: 'child', generation: 2, presentation: 'fullscreen',
})
controller.restore()
expect(controller.getSnapshot()).toMatchObject({ generation: 2, presentation: 'inline' })
```

Also update existing exact snapshot assertions to include `presentation: 'inline'`.

- [ ] **Step 2: Run the controller test and verify RED**

Run: `pnpm exec vitest run tests/client/store.spec.ts`

Expected: FAIL because open snapshots lack `presentation` and `expand()`/`restore()` do not exist.

- [ ] **Step 3: Implement minimal presentation transitions**

Define:

```ts
export type MissionPresentation = 'inline' | 'fullscreen'
```

Add `presentation` to open snapshots. `open()` and `toggle()` start at `inline`; `retarget()` copies the previous presentation into the new generation. `expand()` and `restore()` return without notification when closed or already in the requested presentation, otherwise copy the open state with the new presentation and notify without changing generation.

- [ ] **Step 4: Run the controller test and verify GREEN**

Run: `pnpm exec vitest run tests/client/store.spec.ts`

Expected: all controller and store tests pass.

- [ ] **Step 5: Commit the controller slice**

```bash
git add src/client/controller.ts tests/client/store.spec.ts
git commit -m "feat: add Mission Control presentation state"
```

### Task 2: Expand/Restore portal lifecycle with one EventSource

**Files:**
- Modify: `src/client/Panel.tsx`
- Modify: `src/client/locales.ts`
- Modify: `tests/client/registration.spec.tsx`

**Interfaces:**
- Consumes: `ControllerSnapshot.presentation`, `controller.expand()`, and `controller.restore()` from Task 1.
- Produces: inline Expand and full-screen Restore controls.
- Preserves: one mounted `LiveMission`, `MissionStore`, and `MissionSource` across presentation changes.

- [ ] **Step 1: Write the failing portal and single-stream test**

Extend the registration fixture translation with `panel.expand` and `panel.restore`. After opening inline, assert the Expand button exists, click it, and assert:

```ts
expect(document.querySelector('[role="dialog"][aria-label="Mission Control"]')).toBeTruthy()
expect(document.querySelector('[data-mission-control-panel-host]')?.children).toHaveLength(0)
expect(created).toHaveBeenCalledOnce()
```

Click Restore, then assert the named region returns inside the sidebar host, the inline Expand button receives focus, and `created` is still called exactly once. Press `Escape` from a reopened full-screen dashboard and assert the panel closes. Close from full-screen and assert its EventSource closes once. Extend teardown coverage to assert no dialog remains after unmount.

- [ ] **Step 2: Run the registration test and verify RED**

Run: `pnpm exec vitest run tests/client/registration.spec.tsx`

Expected: FAIL because there is no Expand control or full-screen dialog.

- [ ] **Step 3: Move presentation below the live resource owner**

Keep `LiveMission` mounted for every open, wide panel. Create the `MissionStore` and `MissionSource` before selecting a frame. Render a `MissionPresentationFrame` with these exact semantics:

```tsx
const frame = (
  <PanelFrame presentation={presentation} controller={controller} t={t}>
    <MissionDashboard presentation={presentation} {...dashboardProps} />
  </PanelFrame>
)
return presentation === 'fullscreen' ? createPortal(frame, document.body) : frame
```

`PanelFrame` renders Expand only for `inline`, Restore only for `fullscreen`, and Close for both. Full-screen uses `role="dialog" aria-modal="true"`; inline uses `role="region"`. `LiveMission` keeps the previous presentation in a ref and passes an `autoFocusExpand` flag only on the `fullscreen -> inline` transition, so initial open does not steal focus while Restore focuses the recreated Expand control. Localize labels as `panel.expand`/`panel.restore` in English and Chinese.

- [ ] **Step 4: Run the registration test and verify GREEN**

Run: `pnpm exec vitest run tests/client/registration.spec.tsx`

Expected: portal, single-source, restore, close, and teardown assertions pass.

- [ ] **Step 5: Commit the lifecycle slice**

```bash
git add src/client/Panel.tsx src/client/locales.ts tests/client/registration.spec.tsx
git commit -m "feat: expand and restore the live Mission Control panel"
```

### Task 3: Restore the full-screen topology layout

**Files:**
- Restore: `src/client/components/AgentGraph.tsx`
- Restore: `src/client/components/AgentNode.tsx`
- Modify: `src/client/components/MissionDashboard.tsx`
- Modify: `src/client/styles.ts`
- Modify: `tests/client/dashboard.spec.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tsdown.config.ts`

**Interfaces:**
- Consumes: `presentation: MissionPresentation` from Task 1.
- Produces: inline tabbed layout and full-screen simultaneous `AgentGraph` plus `ToolStream` layout.
- Restores: bundled `d3-hierarchy` and its development types.

- [ ] **Step 1: Write the failing dual-layout dashboard test**

Pass `presentation: 'inline'` from the existing test bench and retain current tab assertions. Add a full-screen test with `presentation: 'fullscreen'` that asserts Agent topology, both Agent edges, and the live Tool stream are present simultaneously, while the Agents/Tools tablist is absent:

```ts
const { props } = bench('full')
const view = render(<MissionDashboard {...props} presentation="fullscreen" />)
expect(view.getByLabelText('Agent topology')).toBeTruthy()
expect(view.getAllByTestId('agent-edge')).toHaveLength(2)
expect(view.getByRole('log', { name: 'Live tool stream' })).toBeTruthy()
expect(view.queryByRole('tablist')).toBeNull()
```

- [ ] **Step 2: Run the dashboard test and verify RED**

Run: `pnpm exec vitest run tests/client/dashboard.spec.tsx`

Expected: FAIL because `MissionDashboard` has no presentation prop and no full-screen graph.

- [ ] **Step 3: Restore accessible Agent topology components**

Restore `AgentGraph` as the D3 `hierarchy()`/`tree()` layout from version `0.1.0`, including deterministic child ordering and SVG edges with `data-testid="agent-edge"`. Restore `AgentNode` buttons with status text, non-color icons, `aria-pressed`, and `graph.selectAgent` labels. Do not use these components in inline mode.

- [ ] **Step 4: Render the presentation-specific dashboard**

Add `presentation: MissionPresentation` to `MissionDashboardProps`. For `inline`, keep the current tabs and `AgentTree`. For `fullscreen`, render:

```tsx
<div className="mc-dashboard__content mc-dashboard__content--fullscreen">
  <AgentGraph {...agentProps} />
  <ToolStream {...toolProps} />
</div>
```

Both layouts reuse the same store snapshot and `selectAgent()` callback.

- [ ] **Step 5: Restore D3 manifest and bundle entries**

Set package version to `0.3.0`, add `d3-hierarchy: ^3.1.2`, add `@types/d3-hierarchy: ^3.1.7`, and include `d3-hierarchy` in `tsdown.config.ts` `onlyBundle`. Run `pnpm install --lockfile-only --offline` to update the lockfile without network access.

- [ ] **Step 6: Add full-screen CSS and verify GREEN**

Add `.mc-panel--fullscreen` as a fixed, full-viewport, high-z-index grid with a 58px title bar. Restore the large HUD metrics, radial Agent graph canvas, absolute Agent nodes, SVG edges, and the two-column `minmax(460px,1fr) minmax(300px,380px)` dashboard only below `.mc-panel--fullscreen`. Preserve the current bounded inline host and compact selectors unchanged.

Run: `pnpm exec vitest run tests/client/dashboard.spec.tsx tests/client/registration.spec.tsx`

Expected: inline and full-screen layout tests pass with one source across presentation transitions.

- [ ] **Step 7: Commit the full-screen UI slice**

```bash
git add src/client/components src/client/styles.ts tests/client/dashboard.spec.tsx package.json pnpm-lock.yaml tsdown.config.ts
git commit -m "feat: restore the full-screen Mission Control dashboard"
```

### Task 4: Release documentation and package verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `tests/package/packed-plugin.spec.ts`

**Interfaces:**
- Consumes: version `0.3.0`, Expand/Restore controls, single-stream behavior, and restored full-screen dashboard.
- Produces: user-facing bilingual usage and packed-bundle regression coverage.

- [ ] **Step 1: Write the failing packed-version test**

Read the packed manifest and assert `version === '0.3.0'`. Assert the client bundle contains localized Expand/Restore behavior and `d3-hierarchy` is bundled rather than referenced as an external runtime. Keep negative assertions for `sidebar.auxiliary`, `openSidebar`, and `shell.overlay`.

- [ ] **Step 2: Run the package test and verify RED**

Run after a build: `pnpm run build && pnpm run test:package`

Expected: version or Expand/Restore packed assertions fail until the release metadata and browser build are current.

- [ ] **Step 3: Update paired README usage**

Document that the inline title bar expands to the original topology-plus-Tool full screen, Restore returns to the live inline panel, and neither transition reconnects the current stream. Update the limitations section to state that presentation preference is not persisted.

- [ ] **Step 4: Run complete release verification**

Run: `pnpm run verify:release`

Expected: typecheck, lint, 68+ tests, build, and packed-package tests pass.

- [ ] **Step 5: Run static release guards**

Run:

```bash
git diff --check
rg -n "sidebar\.auxiliary|openSidebar|shell\.overlay" src README.md README.zh.md package.json
```

Expected: clean diff; forbidden names appear only in explanatory README compatibility text, never in production source or manifest.

- [ ] **Step 6: Commit the release slice**

```bash
git add README.md README.zh.md tests/package/packed-plugin.spec.ts
git commit -m "docs: explain expandable Mission Control"
```
