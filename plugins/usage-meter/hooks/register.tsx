import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Limit, Usage } from '../types'

const usageAtom = atom({ plugin: 'usage-meter', key: 'usage' } as const, null)
const nowAtom = atom({ plugin: 'usage-meter', key: 'now' } as const, 0)

const LABELS: Record<string, string> = { five_hour: 'Session', seven_day: 'Weekly', spend_limit: 'Spend' }
const SHORT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }
const ORDER = ['five_hour', 'seven_day', 'spend_limit']
const FOOTER_LEFT_RESERVE = 62
const PERCENT_WIDTH = 4

type Layout = { isShortLabel: boolean; barCells: number; hasDetail: boolean; gap: number }
type Segment = { key: string; label: string; shortLabel: string; percent: number; detail: string | undefined }

const FULL_LAYOUT: Layout = { isShortLabel: false, barCells: 12, hasDetail: true, gap: 3 }
const MINIMAL_LAYOUT: Layout = { isShortLabel: true, barCells: 0, hasDetail: false, gap: 2 }
const LAYOUTS: Layout[] = [
  FULL_LAYOUT,
  { isShortLabel: false, barCells: 12, hasDetail: false, gap: 3 },
  { isShortLabel: true, barCells: 8, hasDetail: false, gap: 2 },
  MINIMAL_LAYOUT,
]

function toUsage(context: SessionContextUsage, rateLimits: readonly SessionRateLimit[]): Usage {
  return {
    contextPercent: context.percent,
    contextTokens: context.tokens,
    contextWindow: context.window,
    limits: rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  }
}

function filledCells(percent: number, cells: number): number {
  if (percent <= 0) return 0
  if (percent >= 100) return cells
  return Math.min(cells - 1, Math.max(1, Math.round((percent / 100) * cells)))
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

function segmentWidth(segment: Segment, layout: Layout): number {
  const label = layout.isShortLabel ? segment.shortLabel : segment.label
  const bar = layout.barCells > 0 ? layout.barCells + 1 : 0
  const detail = layout.hasDetail && segment.detail ? segment.detail.length + 1 : 0
  return label.length + 1 + bar + PERCENT_WIDTH + detail
}

function pickLayout(segments: Segment[], prefix: string, columns: number | undefined): Layout {
  if (columns === undefined) return FULL_LAYOUT
  const room = columns - FOOTER_LEFT_RESERVE
  return (
    LAYOUTS.find(layout => {
      const parts = segments.map(segment => segmentWidth(segment, layout))
      if (prefix) parts.push(prefix.length)
      const width = parts.reduce((sum, part) => sum + part, 0) + layout.gap * (parts.length - 1)
      return width <= room
    }) ?? MINIMAL_LAYOUT
  )
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

    const segments: Segment[] = [
      {
        key: 'ctx',
        label: 'Context',
        shortLabel: 'ctx',
        percent: usage.contextPercent ?? 0,
        detail: `${formatTokens(usage.contextTokens ?? 0)}/${formatTokens(usage.contextWindow)}`,
      },
      ...sortLimits(usage.limits).map(limit => {
        const reset = formatReset(limit.resetsAt, now)
        return {
          key: `limit-${limit.kind}`,
          label: LABELS[limit.kind] ?? limit.kind,
          shortLabel: SHORT_LABELS[limit.kind] ?? limit.kind,
          percent: limit.percentUsed,
          detail: reset ? `↻ ${reset}` : undefined,
        }
      }),
    ]
    const prefix = e.props.modes.join(' & ')
    const layout = pickLayout(segments, prefix, e.viewport?.columns)

    const meter = (segment: Segment) => {
      const filled = filledCells(segment.percent, layout.barCells)
      const color = fillColor(segment.percent)
      const isAlarming = segment.percent >= 70
      return (
        <Box key={segment.key} flexDirection="row" gap={1}>
          <Text dimColor>{layout.isShortLabel ? segment.shortLabel : segment.label}</Text>
          {layout.barCells > 0 ? (
            <Box flexDirection="row">
              <Text color={color}>{'█'.repeat(filled)}</Text>
              <Text dimColor>{'█'.repeat(layout.barCells - filled)}</Text>
            </Box>
          ) : null}
          <Text bold={isAlarming} color={isAlarming ? color : undefined}>
            {`${Math.round(segment.percent)}%`.padStart(PERCENT_WIDTH)}
          </Text>
          {layout.hasDetail && segment.detail ? <Text dimColor>{segment.detail}</Text> : null}
        </Box>
      )
    }

    return (
      <Box flexDirection="row" gap={layout.gap}>
        {prefix ? <Text dimColor>{prefix}</Text> : null}
        {segments.map(meter)}
      </Box>
    )
  })
}
