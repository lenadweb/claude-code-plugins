import type { Elements } from 'claude-code'

import { formatPercent } from './format'
import { labelOf, PERCENT_WIDTH } from './layout'
import type { Layout } from './layout'
import type { Segment } from './usage'

type FooterElements = Pick<Elements['terminal'], 'Box' | 'Text'>

const BLOCK = '█'
const WARNING_PERCENT = 70
const DANGER_PERCENT = 90

export function renderFooter(ui: FooterElements, modes: string, segments: Segment[], layout: Layout) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" gap={layout.gap}>
      {modes ? <Text dimColor>{modes}</Text> : null}
      {segments.map(segment => renderMeter(ui, segment, layout))}
    </Box>
  )
}

function renderMeter(ui: FooterElements, segment: Segment, layout: Layout) {
  const { Box, Text } = ui
  const isHigh = segment.percent >= WARNING_PERCENT
  const showDetail = layout.showDetails && segment.detail

  return (
    <Box key={segment.key} flexDirection="row" gap={1}>
      <Text dimColor>{labelOf(segment, layout)}</Text>
      {layout.barWidth > 0 ? renderBar(ui, segment.percent, layout.barWidth) : null}
      <Text bold={isHigh} color={isHigh ? barColor(segment.percent) : undefined}>
        {formatPercent(segment.percent).padStart(PERCENT_WIDTH)}
      </Text>
      {showDetail ? <Text dimColor>{segment.detail}</Text> : null}
    </Box>
  )
}

function renderBar(ui: FooterElements, percent: number, width: number) {
  const { Box, Text } = ui
  const filled = filledCells(percent, width)
  return (
    <Box flexDirection="row">
      <Text color={barColor(percent)}>{BLOCK.repeat(filled)}</Text>
      <Text dimColor>{BLOCK.repeat(width - filled)}</Text>
    </Box>
  )
}

function filledCells(percent: number, width: number): number {
  if (percent <= 0) {
    return 0
  }
  if (percent >= 100) {
    return width
  }
  const cells = Math.round((percent / 100) * width)
  return Math.min(width - 1, Math.max(1, cells))
}

function barColor(percent: number): string {
  if (percent >= DANGER_PERCENT) {
    return 'error'
  }
  if (percent >= WARNING_PERCENT) {
    return 'warning'
  }
  return 'suggestion'
}
