import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { renderFooter } from './footer'
import { pickLayout } from './layout'
import { buildSegments, toUsage } from './usage'

const usageAtom = atom({ plugin: 'usage-meter', key: 'usage' } as const, null)
const nowAtom = atom({ plugin: 'usage-meter', key: 'now' } as const, 0)

const CLOCK_TICK_MS = 60_000

async function refreshClock($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  await update($, nowAtom, () => now)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    const { context, rateLimits } = await $.session.usage()
    await update($, usageAtom, () => toUsage(context, rateLimits))
    await refreshClock($)

    $.clock.every(CLOCK_TICK_MS, () => {
      void refreshClock($)
    })

    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, usageAtom, () => toUsage(e.context, e.rateLimits))
    await refreshClock($)
    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const usage = await read($, usageAtom)
    if (usage === null) {
      return next(e)
    }

    const now = await read($, nowAtom)
    const modes = e.props.modes.join(' & ')
    const segments = buildSegments(usage, now)
    const layout = pickLayout(segments, modes, e.viewport?.columns)

    return renderFooter($.ui.resolve(e), modes, segments, layout)
  })
}
