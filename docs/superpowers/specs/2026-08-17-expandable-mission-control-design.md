# Expandable Mission Control Design

## Goal

Add an explicit full-screen presentation to Mission Control while preserving the rc.7 inline panel as the default. Users can expand the current live view to the original large dashboard and restore it to the Session-list panel without losing telemetry state.

## User experience

The inline title bar gains an **Expand** button before **Close**. Expand replaces the inline presentation with a fixed full-screen dashboard. The full-screen title bar provides **Restore** and **Close** buttons. Restore returns the same live mission to the inline host below the Session list. `Escape` closes Mission Control from either presentation.

The inline presentation keeps the current compact Agents/Tools tabs. The full-screen presentation restores the original simultaneous layout: global Token/CNY HUD across the top, Agent topology on the left, and Tool live stream on the right. The selected Agent continues to filter the HUD and Tool stream in both presentations.

Expand and Restore are presentation-only transitions. They do not reconnect SSE, increment the viewing generation, clear Tool rows, reset Agent selection, or change the current Session. Closing, retargeting to another Session, sidebar collapse, and plugin teardown retain their current lifecycle behavior.

## Architecture

`MissionControlController` owns an `inline | fullscreen` presentation field whenever the panel is open. `expand()` and `restore()` update only that field and notify subscribers. Opening starts in `inline`; retargeting preserves the current presentation; closing removes all open state.

`MissionControlPanel` remains mounted through the rc.7 `sidebar.footer.action` lifecycle anchor. `LiveMission` continues to own the single `MissionStore` and `MissionSource`. It renders its frame through React Portal into one of two targets:

- inline: the existing plugin-owned host before the Harness sidebar footer;
- fullscreen: `document.body`, using a plugin-owned fixed overlay element.

Changing the portal target may recreate presentation components, but it does not recreate `LiveMission`, `MissionStore`, or `MissionSource`. Authoritative telemetry and Agent selection therefore remain intact. No `shell.overlay`, `sidebar.auxiliary`, `openSidebar()`, or Harness source modification is introduced.

## Components

- `PanelFrame` selects inline region semantics or full-screen modal-dialog semantics and renders Expand, Restore, and Close controls.
- `MissionDashboard` accepts a presentation mode. Inline mode renders `AgentTree` or `ToolStream` through tabs. Full-screen mode renders `AgentGraph` and `ToolStream` simultaneously.
- `AgentGraph` and its accessible Agent nodes return only for full-screen mode. D3 hierarchy layout is bundled again because the large topology benefits from spatial parent/child edges; the compact view continues using the zero-dependency `AgentTree`.
- The style module owns separate `.mc-panel` and `.mc-panel--fullscreen` layouts. The fixed full-screen element covers the DSH Web content and uses the previous large-dashboard proportions without changing Harness layout state.

## Accessibility and focus

The inline panel remains a named `region`. The full-screen panel uses a named `dialog` with `aria-modal="true"`. Expand and Restore have localized accessible labels and visible icons. Close restores focus to the button that originally opened Mission Control. Restore places focus on the inline Expand button after the inline frame is mounted. Keyboard `Escape` closes either presentation.

## Failure and teardown behavior

If the rc.7 sidebar host cannot be resolved, the existing named integration error remains authoritative. Full-screen rendering requires `document.body`, which is guaranteed in DSH Web's browser runtime. Plugin teardown removes the sidebar host and full-screen portal content through React unmount, and closes the active EventSource exactly once.

## Compatibility and release

This remains a Harness rc.7 plugin-only implementation. The package version advances from `0.2.0` to `0.3.0` because it adds a user-visible presentation mode without changing configuration or server protocol. English and Chinese README usage sections document Expand, Restore, and the unchanged single-stream lifecycle.

## Verification

Tests must prove:

1. open state starts inline, Expand and Restore do not change generation, and retarget preserves presentation;
2. the inline frame exposes Expand and the full-screen dialog exposes Restore;
3. full-screen mode shows Agent topology and Tool stream simultaneously, while inline mode retains tabs;
4. one EventSource remains open across Expand and Restore;
5. Close, sidebar collapse, Session retarget, and unmount close the appropriate source and remove portal content;
6. the packed browser bundle contains no unpublished Harness APIs or `shell.overlay` registration;
7. typecheck, lint, the complete test suite, build, and packed-package verification pass.

## Non-goals

- No draggable or resizable full-screen window.
- No persisted presentation preference across page reloads.
- No history playback or second telemetry subscription.
- No changes to Harness rc.7 source or Web composition slots.
