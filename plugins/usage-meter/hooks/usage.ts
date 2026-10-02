import type { SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Limit, Usage } from '../types'
import { formatTimeLeft, formatTokens } from './format'

export type Segment = {
  key: string
  label: string
  shortLabel: string
  percent: number
  detail?: string
}

const LIMIT_NAMES: Record<string, { label: string; shortLabel: string }> = {
  five_hour: { label: 'Session', shortLabel: '5h' },
  seven_day: { label: 'Weekly', shortLabel: '7d' },
  spend_limit: { label: 'Spend', shortLabel: '$' },
}

const LIMIT_ORDER = ['five_hour', 'seven_day', 'spend_limit']

export function toUsage(context: SessionContextUsage, rateLimits: readonly SessionRateLimit[]): Usage {
  return {
    contextPercent: context.percent,
    contextTokens: context.tokens,
    contextWindow: context.window,
    limits: rateLimits.map(limit => ({
      kind: limit.kind,
      percentUsed: limit.percentUsed,
      resetsAt: limit.resetsAt,
    })),
  }
}

export function buildSegments(usage: Usage, now: number): Segment[] {
  const contextSegment = toContextSegment(usage)
  const limitSegments = sortLimits(usage.limits).map(limit => toLimitSegment(limit, now))
  return [contextSegment, ...limitSegments]
}

function toContextSegment(usage: Usage): Segment {
  const used = formatTokens(usage.contextTokens ?? 0)
  const total = formatTokens(usage.contextWindow)
  return {
    key: 'context',
    label: 'Context',
    shortLabel: 'ctx',
    percent: usage.contextPercent ?? 0,
    detail: `${used}/${total}`,
  }
}

function toLimitSegment(limit: Limit, now: number): Segment {
  const names = LIMIT_NAMES[limit.kind] ?? { label: limit.kind, shortLabel: limit.kind }
  const timeLeft = formatTimeLeft(limit.resetsAt, now)
  return {
    key: limit.kind,
    label: names.label,
    shortLabel: names.shortLabel,
    percent: limit.percentUsed,
    detail: timeLeft ? `↻ ${timeLeft}` : undefined,
  }
}

function sortLimits(limits: readonly Limit[]): Limit[] {
  return [...limits].sort((a, b) => orderOf(a.kind) - orderOf(b.kind))
}

function orderOf(kind: string): number {
  const index = LIMIT_ORDER.indexOf(kind)
  return index === -1 ? LIMIT_ORDER.length : index
}
