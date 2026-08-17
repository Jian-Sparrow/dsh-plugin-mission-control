# Mission Control Inline Sidebar for Harness rc.7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render live Mission Control below the existing Session list on unmodified Harness rc.7 while keeping the list usable.

**Architecture:** Keep the supported `sidebar.footer.action` contribution as the lifecycle anchor. A small DOM adapter inserts a plugin-owned host immediately before the sidebar footer, and the action renders the panel into that host with React Portal. The footer contribution reports the sidebar `wide` state so header and footer launches call the existing `toggleSidebar()` only when the rail is collapsed.

**Tech Stack:** TypeScript ESM, React 18, ReactDOM Portal, Cordis client slots, Vitest, Testing Library, jsdom.

## Global Constraints

- Do not modify or require unpublished Harness APIs.
- Do not reference `ctx.layout.openSidebar()` or `sidebar.auxiliary`.
- Use only Harness rc.7's `sidebar.footer.action`, `shell.overlay` removal, and `ctx.layout.toggleSidebar()`.
- Keep the Session list mounted, visible, scrollable, and selectable while the panel is open.
- The panel is live-only and follows the globally current Session.
- Remove every plugin-created DOM host and EventSource on teardown.

---

### Task 1: Sidebar DOM host adapter

**Files:**
- Create: `src/client/sidebar-host.ts`
- Create: `tests/client/sidebar-host.spec.ts`

**Interfaces:**
- Produces: `mountSidebarPanelHost(anchor: HTMLElement): { element: HTMLDivElement; dispose(): void }`
- Consumes: the framework-owned `[data-slot="sidebar.footer.action"]` outlet and its rc.7 parent order.

- [ ] **Step 1: Write the failing host-order and cleanup tests**

Build a jsdom sidebar fixture containing a workspaces outlet, footer-action outlet, and settings outlet. Assert that `mountSidebarPanelHost()` inserts `[data-mission-control-panel-host]` between the browsing region and footer, reuses one host, and removes it after the final disposer.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run tests/client/sidebar-host.spec.ts`

Expected: module resolution failure because `sidebar-host.ts` does not exist.

- [ ] **Step 3: Implement the minimal adapter**

Locate the footer outlet with `closest()`, validate the rc.7 parent order, insert one host before the footer, reference-count users, and remove it when the count reaches zero. Throw a named error when the anchor is outside the expected sidebar structure.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm exec vitest run tests/client/sidebar-host.spec.ts`

Expected: all adapter tests pass.

### Task 2: Portal lifecycle and existing toggle API

**Files:**
- Modify: `src/client/controller.ts`
- Modify: `src/client/Action.tsx`
- Create: `src/client/Panel.tsx`
- Modify: `src/client/index.ts`
- Delete: `src/client/Overlay.tsx`
- Modify: `tests/client/store.spec.ts`
- Modify: `tests/client/registration.spec.tsx`

**Interfaces:**
- Produces: `MissionControlController.toggle()`, `retarget()`, `reportSidebarWide()`, and `revealSidebar()`.
- Produces: `MissionControlPanel`, rendered with `createPortal()` from the footer action.

- [ ] **Step 1: Write failing controller and registration tests**

Assert that rail launch calls `toggleSidebar()` exactly once, wide launch never collapses the sidebar, both launch surfaces toggle the panel, the portal host is inserted before the footer, Session changes replace the EventSource, rail mode hides the panel, and disposal removes the host.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec vitest run tests/client/store.spec.ts tests/client/registration.spec.tsx`

Expected: failures for the missing controller methods and portal panel.

- [ ] **Step 3: Implement controller, action, panel, and registrations**

Keep only header and footer slot registrations. The footer action mounts the DOM host, reports `wide`, and portals `MissionControlPanel`; both actions reveal through the controller before toggling. The panel retargets to `useSessions(state => state.current)`, creates no source without a Session, and closes its source on retarget, close, or unmount.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm exec vitest run tests/client/store.spec.ts tests/client/registration.spec.tsx`

Expected: all controller and integration tests pass.

### Task 3: Compact sidebar presentation and release contract

**Files:**
- Create: `src/client/components/AgentTree.tsx`
- Modify: `src/client/components/MissionDashboard.tsx`
- Modify: `src/client/components/GlobalHud.tsx`
- Modify: `src/client/components/ToolStream.tsx`
- Delete: `src/client/components/AgentGraph.tsx`
- Delete: `src/client/components/AgentNode.tsx`
- Modify: `src/client/styles.ts`
- Modify: `src/client/locales.ts`
- Modify: `tests/client/dashboard.spec.tsx`
- Modify: `tests/package/packed-plugin.spec.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tsdown.config.ts`
- Modify: `README.md`
- Modify: `README.zh.md`

**Interfaces:**
- Produces: an Agents-first two-tab dashboard with compact Token/CNY/Agent/Tool HUD.
- Produces: npm version `0.2.0` compatible with existing Harness `0.1.0-rc.7` APIs.

- [ ] **Step 1: Write failing compact-dashboard and packed-bundle tests**

Assert that Agents is the initial tab, Tools renders only after selection, Agent filtering still filters tools and metrics, the packed browser bundle contains the DOM host marker and `sidebar.footer.action`, and contains neither `sidebar.auxiliary` nor `openSidebar`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec vitest run tests/client/dashboard.spec.tsx tests/package/packed-plugin.spec.ts`

Expected: tab and packed-marker assertions fail against the full-screen build.

- [ ] **Step 3: Implement compact components, CSS, manifest, and docs**

Replace the D3 graph with a depth-indented Agent list, remove D3 dependencies, add compact Agents/Tools tabs and HUD, style the plugin-owned host as a bounded flex child, document the rc.7 DOM adapter and compatibility limit, and bump to `0.2.0`.

- [ ] **Step 4: Run release verification**

Run: `pnpm run verify:release`

Expected: typecheck, lint, 64+ tests, build, and packed-plugin tests pass.

- [ ] **Step 5: Search for forbidden APIs**

Run: `rg -n "sidebar\\.auxiliary|openSidebar|shell\\.overlay|mc-overlay" src tests README.md README.zh.md package.json`

Expected: only negative assertions may mention forbidden APIs; production source and docs contain none.
