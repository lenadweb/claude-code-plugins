import type { Segment } from './usage'

export type Layout = {
  useShortLabels: boolean
  barWidth: number
  showDetails: boolean
  gap: number
}

export const PERCENT_WIDTH = 4

const FOOTER_LEFT_SIDE_WIDTH = 62

const FULL: Layout = { useShortLabels: false, barWidth: 12, showDetails: true, gap: 3 }
const WITHOUT_DETAILS: Layout = { ...FULL, showDetails: false }
const SHORT: Layout = { useShortLabels: true, barWidth: 8, showDetails: false, gap: 2 }
const PERCENT_ONLY: Layout = { ...SHORT, barWidth: 0 }

const LAYOUTS_FROM_WIDEST = [FULL, WITHOUT_DETAILS, SHORT, PERCENT_ONLY]

export function pickLayout(segments: Segment[], modes: string, terminalColumns: number | undefined): Layout {
  if (terminalColumns === undefined) {
    return FULL
  }

  const freeColumns = terminalColumns - FOOTER_LEFT_SIDE_WIDTH
  const fitting = LAYOUTS_FROM_WIDEST.find(layout => footerWidth(segments, modes, layout) <= freeColumns)
  return fitting ?? PERCENT_ONLY
}

export function labelOf(segment: Segment, layout: Layout): string {
  return layout.useShortLabels ? segment.shortLabel : segment.label
}

function footerWidth(segments: Segment[], modes: string, layout: Layout): number {
  const widths = segments.map(segment => meterWidth(segment, layout))
  if (modes) {
    widths.push(modes.length)
  }
  const gaps = layout.gap * (widths.length - 1)
  return widths.reduce((total, width) => total + width, gaps)
}

function meterWidth(segment: Segment, layout: Layout): number {
  const label = labelOf(segment, layout).length + 1
  const bar = layout.barWidth > 0 ? layout.barWidth + 1 : 0
  const detail = layout.showDetails && segment.detail ? segment.detail.length + 1 : 0
  return label + bar + PERCENT_WIDTH + detail
}
