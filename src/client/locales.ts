/** Mission Control browser dictionary namespace. */
export const NS = 'mission-control'

/** Browser copy keys owned by Mission Control. */
export type MissionControlKey = keyof typeof en

/** English browser copy. */
export const en = {
  'action.label': 'Mission Control',
  'action.open': 'Open Mission Control',
  'overlay.close': 'Close Mission Control',
  'overlay.connecting': 'Connecting to live mission telemetry…',
} as const

/** Simplified Chinese browser copy. */
export const zh: Record<MissionControlKey, string> = {
  'action.label': '任务控制台',
  'action.open': '打开任务控制台',
  'overlay.close': '关闭任务控制台',
  'overlay.connecting': '正在连接实时任务遥测…',
}
