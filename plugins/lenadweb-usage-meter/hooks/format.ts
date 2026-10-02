const MINUTE_MS = 60_000
const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`
  }
  return String(tokens)
}

export function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`
}

export function formatTimeLeft(resetsAt: string | undefined, now: number): string | undefined {
  if (!resetsAt || !now) {
    return undefined
  }

  const minutesLeft = Math.floor((Date.parse(resetsAt) - now) / MINUTE_MS)
  if (!(minutesLeft > 0)) {
    return undefined
  }

  const days = Math.floor(minutesLeft / MINUTES_PER_DAY)
  const hours = Math.floor((minutesLeft % MINUTES_PER_DAY) / MINUTES_PER_HOUR)
  const minutes = minutesLeft % MINUTES_PER_HOUR

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}
