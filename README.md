# Mission Control for DeepSeek Harness

Live observability for the current DeepSeek Harness Session. Mission Control turns Agent activity, Tool calls, in-process subagent collaboration, and authoritative token counters into a full-screen dashboard inside DSH Web.

[中文说明](./README.zh.md)

## What it shows

- A global HUD with connection state, total tokens, four token buckets, recent token velocity, Agent count, running Tool count, and diagnostics.
- A selectable Agent topology rooted at the current Session. Selecting an Agent filters token totals and Tool rows.
- A live Tool stream with ownership, timing, result state, bounded rows, and optional payload previews.
- Two native entry points: the current Session header and the DSH Web sidebar footer.

Mission Control is live-only. It opens one same-origin SSE subscription when you enter the page, freezes the last snapshot while reconnecting, and releases the subscription on close, Session change, plugin unload, or browser disconnect. It does not add model tools, prompts, or hidden reasoning to the model context.

## Requirements

- DeepSeek Harness `0.1.0-rc.6`
- The DSH Web profile
- Node.js `^22.19.0` or `>=24.0.0`
- pnpm through Corepack

## Install

Install the bundle into the Web profile, verify the composed row, then start DSH Web:

```sh
dsh plugin --profile web add dsh-plugin-mission-control
dsh --profile web --dump-config
dsh --profile web
```

The package bundle inserts one Cordis row. Its shipped layer is equivalent to:

```yaml
- id: mission-control
  name: dsh-plugin-mission-control
  config:
    previewMode: names-only
    tokenPublishIntervalMs: 250
    velocityWindowMs: 5000
    maxLiveRows: 300
```

To change settings, override the complete `mission-control` row in the profile or home `cordis.patch.yml`. To use a checkout instead of npm, run `dsh plugin --profile web add ./dsh-plugin-mission-control`.

## Use

Start or open a Session in DSH Web. Choose **Mission Control** in the Session header, or use the **◎ Mission Control** action beside Settings in the sidebar. The sidebar action is disabled when no Session is selected. Closing the dashboard returns focus to the launch button. Changing the selected Session closes the old dashboard and does not open the new Session automatically.

The HUD token fields come from the Harness token-meter projection:

- **Input**: uncached input tokens.
- **Output**: generated output tokens.
- **Cache read**: input served from provider cache.
- **Cache write**: input written to provider cache.
- **Recent tokens/s**: change in authoritative totals over the configured rolling window; it is an activity rate, not a billing estimate.

Mission Control intentionally does not calculate monetary cost because model pricing metadata is not uniformly authoritative.

## Privacy and previews

`previewMode` controls the Tool payload surface:

- `names-only` (default): Tool name, owner, timing, and outcome only. Arguments and results are not transmitted for presentation.
- `redacted`: bounded argument and result summaries with configured sensitive fields and credential-like text replaced. Redaction is best-effort and is not a security boundary.
- `full`: complete recorded Tool arguments and results up to transport limits. The dashboard keeps a visible warning on screen.

The dashboard never renders model chain-of-thought or hidden reasoning. It shows only Session facts already recorded by Harness: Agent state, Tool activity, subagent labels, response state, and token projections.

DSH Web owns network exposure. Mission Control uses a same-origin endpoint and inherits the Web profile's bind address, trusted-host checks, authentication, reverse-proxy behavior, and LAN risk. Do not expose DSH Web to an untrusted network merely to view this dashboard.

## Configuration

| Field | Default | Valid values | Meaning |
| --- | ---: | --- | --- |
| `previewMode` | `names-only` | `names-only`, `redacted`, `full` | Tool payload visibility |
| `maxPreviewBytes` | `2048` | `128..65536` | Maximum preview bytes per value |
| `sensitiveFieldNames` | common credential names | string array | Case-insensitive object keys removed in redacted mode |
| `tokenPublishIntervalMs` | `250` | `50..5000` | Token update coalescing interval |
| `velocityWindowMs` | `5000` | `1000..60000` | Rolling recent-token-rate window |
| `maxLiveRows` | `300` | `50..2000` | Maximum Tool rows retained per viewing epoch |
| `maxPendingFrames` | `64` | `8..512` | Maximum queued SSE frames per subscriber |

Every field is validated when the Cordis plugin loads. Invalid configuration fails loudly.

## Subagents and limits

In-process, Session-backed subagents appear as descendants and can be inspected with the same authoritative projections as the root. An unreadable Session remains visible as unavailable. External or process-isolated agents that do not publish Harness Session events are opaque; Mission Control does not infer their hidden activity.

This release watches only the current Session and its Session-backed descendants. It does not provide history playback, cross-Session aggregation, cost estimation, distributed tracing, or a standalone Web server. Tool rows are bounded in memory; reopening the dashboard starts a fresh viewing epoch.

## Troubleshooting

- **The action is missing:** confirm `dsh --profile web --dump-config` contains the `mission-control` row and restart DSH Web after installing the bundle.
- **The sidebar action is disabled:** select a Session first.
- **The page says Reconnecting:** inspect the browser Network panel for `/plugins/mission-control/events`; keep the request same-origin and check reverse-proxy buffering/timeouts.
- **No subagent node appears:** verify the provider creates Session-backed, in-process subagents. Opaque external agents cannot be expanded.
- **Token totals do not move:** the active composition must include the Harness token-meter and Session projection services; the plugin fails to load when required services are absent.
- **Payloads are hidden:** `names-only` is the privacy default. Override the complete Cordis row to choose another mode.

## Development

```sh
pnpm install
pnpm run verify:release
pnpm pack --dry-run
```

The host entry is ESM at `dsh-plugin-mission-control`; DSH Web loads `dsh-plugin-mission-control/client` through the browser module loader. The browser bundle externalizes React and Cordis-provided runtimes.

## License

MIT
