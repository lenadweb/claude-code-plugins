import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Limit, Usage } from '../types'

const usageAtom = atom({ plugin: 'usage-meter', key: 'usage' } as const, null)
const nowAtom = atom({ plugin: 'usage-meter', key: 'now' } as const, 0)

const BAR_CELLS = 12
const LABELS: Record<string, string> = { five_hour: 'Session', seven_day: 'Weekly', spend_limit: 'Spend' }
const ORDER = ['five_hour', 'seven_day', 'spend_limit']

function toUsage(context: SessionContextUsage, rateLimits: readonly SessionRateLimit[]): Usage {
  return {
    contextPercent: context.percent,
    contextTokens: context.tokens,
    contextWindow: context.window,
    limits: rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  }
}

// Cells filled for a percentage: any usage shows at least one, and only 100% fills the bar.
function filledCells(percent: number): number {
  if (percent <= 0) return 0
  if (percent >= 100) return BAR_CELLS
  return Math.min(BAR_CELLS - 1, Math.max(1, Math.round((percent / 100) * BAR_CELLS)))
}

function fillColor(percent: number): string {
  if (percent >= 90) return 'error'
  if (percent >= 70) return 'warning'
  return 'suggestion'
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function formatReset(resetsAt: string | undefined, now: number): string | undefined {
  if (!resetsAt || !now) return undefined
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function sortLimits(limits: readonly Limit[]): Limit[] {
  const rank = (k: string) => (ORDER.indexOf(k) === -1 ? ORDER.length : ORDER.indexOf(k))
  return [...limits].sort((a, b) => rank(a.kind) - rank(b.kind))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const usage = await $.session.usage()
    await update($, usageAtom, () => toUsage(usage.context, usage.rateLimits))
    const now = await $.clock.now()
    await update($, nowAtom, () => now)

    // Keeps the "resets in" countdowns fresh between measurements.
    $.clock.every(60_000, () => {
      void $.clock.now().then(t => update($, nowAtom, () => t))
    })

    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, usageAtom, () => toUsage(e.context, e.rateLimits))
    const now = await $.clock.now()
    await update($, nowAtom, () => now)
    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const usage = await read($, usageAtom)
    if (usage === null) return next(e)

    const now = await read($, nowAtom)
    const { Box, Text } = $.ui.resolve(e)

    const meter = (key: string, label: string, percent: number, detail: string | undefined) => {
      const filled = filledCells(percent)
      const color = fillColor(percent)
      const isAlarming = percent >= 70
      return (
        <Box key={key} flexDirection="row" gap={1}>
          <Text dimColor>{label}</Text>
          <Box flexDirection="row">
            <Text color={color}>{'█'.repeat(filled)}</Text>
            <Text dimColor>{'█'.repeat(BAR_CELLS - filled)}</Text>
          </Box>
          <Text bold={isAlarming} color={isAlarming ? color : undefined}>
            {`${Math.round(percent)}%`.padStart(4)}
          </Text>
          {detail ? <Text dimColor>{detail}</Text> : null}
        </Box>
      )
    }

    const contextDetail = `${formatTokens(usage.contextTokens ?? 0)}/${formatTokens(usage.contextWindow)}`
    const meters = [
      meter('ctx', 'Context', usage.contextPercent ?? 0, contextDetail),
      ...sortLimits(usage.limits).map(limit => {
        const reset = formatReset(limit.resetsAt, now)
        return meter(
          `limit-${limit.kind}`,
          LABELS[limit.kind] ?? limit.kind,
          limit.percentUsed,
          reset ? `↻ ${reset}` : undefined,
        )
      }),
    ]

    return (
      <Box flexDirection="row" gap={3}>
        {e.props.modes.length > 0 ? <Text dimColor>{e.props.modes.join(' & ')}</Text> : null}
        {meters}
      </Box>
    )
  })
}
