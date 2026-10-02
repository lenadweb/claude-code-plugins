import { packColor, TERMINAL_DEFAULT_COLOR, xtermColor } from './color'
import { FULL_BLOCK } from './glyphs'
import { encodeCells } from './raster'
import type { CellBox } from './sizing'

const ESCAPE = '\u001b'
const SPACE = 0x20
const LAST_BMP_CODE_POINT = 0xffff

type Style = {
  foreground: number
  background: number
  isInverse: boolean
}

export function chafaArgs(chafaPath: string, file: string, size: CellBox, hasTrueColor: boolean): string[] {
  return [
    chafaPath,
    '--format', 'symbols',
    '--size', `${size.columns}x${size.rows}`,
    '--stretch',
    '--colors', hasTrueColor ? 'full' : '256',
    '--symbols', 'block+border+space',
    '--animate', 'off',
    '--polite', 'on',
    file,
  ]
}

export function chafaOutputToCells(output: string, size: CellBox): string | null {
  const lines = output.replace(/\r/g, '').split('\n').filter(line => line.length > 0)
  if (lines.length < size.rows) {
    return null
  }

  const words = new Uint32Array(size.columns * size.rows * 3)
  lines.slice(0, size.rows).forEach((line, row) => writeLine(words, line, row, size.columns))
  return encodeCells(words)
}

function writeLine(words: Uint32Array, line: string, row: number, columns: number): void {
  const style: Style = { foreground: TERMINAL_DEFAULT_COLOR, background: TERMINAL_DEFAULT_COLOR, isInverse: false }
  let column = 0
  let index = 0

  while (index < line.length && column < columns) {
    if (line[index] === ESCAPE) {
      const end = line.indexOf('m', index)
      if (end === -1) {
        break
      }
      applySgr(style, line.slice(index + 2, end))
      index = end + 1
      continue
    }

    const codePoint = line.codePointAt(index) ?? SPACE
    index += codePoint > LAST_BMP_CODE_POINT ? 2 : 1
    const isDrawable = codePoint >= SPACE && codePoint <= LAST_BMP_CODE_POINT
    writeCell(words, row * columns + column, isDrawable ? codePoint : FULL_BLOCK, style)
    column++
  }

  const blank: Style = { foreground: TERMINAL_DEFAULT_COLOR, background: TERMINAL_DEFAULT_COLOR, isInverse: false }
  for (; column < columns; column++) {
    writeCell(words, row * columns + column, SPACE, blank)
  }
}

function writeCell(words: Uint32Array, cell: number, codePoint: number, style: Style): void {
  words[cell * 3] = codePoint
  words[cell * 3 + 1] = style.isInverse ? style.background : style.foreground
  words[cell * 3 + 2] = style.isInverse ? style.foreground : style.background
}

function applySgr(style: Style, parameters: string): void {
  const codes = parameters.split(';').map(Number)
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]
    const isColor = code === 38 || code === 48
    const isForeground = code === 38

    if (code === 0) {
      style.foreground = TERMINAL_DEFAULT_COLOR
      style.background = TERMINAL_DEFAULT_COLOR
      style.isInverse = false
    } else if (code === 7) {
      style.isInverse = true
    } else if (code === 27) {
      style.isInverse = false
    } else if (code === 39) {
      style.foreground = TERMINAL_DEFAULT_COLOR
    } else if (code === 49) {
      style.background = TERMINAL_DEFAULT_COLOR
    } else if (isColor && codes[i + 1] === 5) {
      setColor(style, isForeground, packColor(xtermColor(codes[i + 2] ?? 0)))
      i += 2
    } else if (isColor && codes[i + 1] === 2) {
      setColor(style, isForeground, packColor([codes[i + 2] ?? 0, codes[i + 3] ?? 0, codes[i + 4] ?? 0]))
      i += 4
    }
  }
}

function setColor(style: Style, isForeground: boolean, color: number): void {
  if (isForeground) {
    style.foreground = color
  } else {
    style.background = color
  }
}
