import { describe, expect, it } from 'vitest'

import {
  emptyToolState,
  finishTool,
  startTool,
} from '../../src/host/tool-state.ts'

describe('Tool state fold', () => {
  it('pairs reverse-order results by Session and call identity', () => {
    const empty = emptyToolState()
    const first = startTool(empty, 'root', call('same', 'bash', 10, '{"x":1}'))
    const started = startTool(first, 'child', call('same', 'read', 20, '{"x":2}'))
    const childDone = finishTool(started, 'child', result('same', 30))
    const allDone = finishTool(childDone, 'root', result('same', 40, 'FAILED'))

    expect(empty.tools.size).toBe(0)
    expect(allDone.tools.get('child:same')?.tool).toMatchObject({
      sessionId: 'child',
      status: 'success',
      finishedAt: 30,
    })
    expect(allDone.tools.get('root:same')?.tool).toMatchObject({
      sessionId: 'root',
      status: 'error',
      finishedAt: 40,
    })
    expect(allDone.tools.get('root:same')?.rawArguments).toBe('{"x":1}')
  })

  it.each(['ABORTED', 'ABORTED_BEFORE_DISPATCH']) (
    'maps %s to cancellation',
    code => {
      const started = startTool(emptyToolState(), 'root', call('c1', 'bash', 10, '{}'))
      expect(finishTool(started, 'root', result('c1', 20, code)).tools.get('root:c1')?.tool.status)
        .toBe('cancelled')
    },
  )

  it('counts an unmatched result without fabricating a row', () => {
    const state = finishTool(emptyToolState(), 'root', result('ghost', 20))
    expect(state.tools.size).toBe(0)
    expect(state.diagnostics).toBe(1)
  })
})

function call(callId: string, name: string, time: number, argumentsJson: string) {
  return { time, data: { callId, name, arguments: argumentsJson } }
}

function result(callId: string, time: number, code?: string) {
  return {
    time,
    data: {
      message: { source: { callId } },
      ...(code === undefined ? {} : { error: { name: 'ToolError', code } }),
    },
  }
}
