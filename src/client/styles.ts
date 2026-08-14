const STYLE_ID = 'dsh-mission-control-styles'

const CSS = `
.mc-action{align-items:center;background:transparent;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;color:inherit;cursor:pointer;display:inline-flex;font:inherit;gap:7px;min-height:30px;padding:5px 10px}.mc-action:hover{background:color-mix(in srgb,currentColor 7%,transparent)}.mc-action:disabled{cursor:not-allowed;opacity:.4}.mc-action--rail{border:0;height:34px;justify-content:center;padding:5px;width:34px}.mc-action__mark{font-size:14px;line-height:1}.mc-overlay{background:#071019;color:#eaf2f8;display:grid;inset:0;overflow:hidden;pointer-events:auto;position:fixed;z-index:1000}.mc-overlay__topbar{align-items:center;border-bottom:1px solid #20303d;display:flex;height:58px;justify-content:space-between;padding:0 22px}.mc-overlay__brand{align-items:center;display:flex;font-size:15px;font-weight:700;gap:10px;letter-spacing:.02em}.mc-overlay__live{background:#173c31;border-radius:999px;color:#75e6ac;font-size:11px;padding:4px 8px}.mc-overlay__close{background:transparent;border:1px solid #344653;border-radius:8px;color:inherit;cursor:pointer;font-size:18px;height:34px;width:34px}.mc-overlay__body{display:grid;place-items:center}.mc-overlay__connecting{color:#9bb0be;font-size:14px}
`

/** Install the browser stylesheet once per plugin fiber. */
export function installStyles(): () => void {
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.append(style)
  return () => { style.remove() }
}
