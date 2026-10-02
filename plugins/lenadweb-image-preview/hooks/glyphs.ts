import type { Rgb } from './color'

export const SAMPLES_ACROSS = 4
export const SAMPLES_DOWN = 8
export const SAMPLES_PER_CELL = SAMPLES_ACROSS * SAMPLES_DOWN
export const FULL_BLOCK = 0x2588

export type CellMatch = {
  glyph: number
  foreground: Rgb
  background: Rgb
}

type Glyph = {
  code: number
  covers: Uint8Array
}

const FLAT_CELL_ERROR = 9600

const GLYPHS: Glyph[] = [
  glyph(0x2580, (_, y) => y < 4),
  glyph(0x2581, (_, y) => y >= 7),
  glyph(0x2582, (_, y) => y >= 6),
  glyph(0x2583, (_, y) => y >= 5),
  glyph(0x2585, (_, y) => y >= 3),
  glyph(0x2586, (_, y) => y >= 2),
  glyph(0x2587, (_, y) => y >= 1),
  glyph(0x258e, x => x < 1),
  glyph(0x258c, x => x < 2),
  glyph(0x258a, x => x < 3),
  glyph(0x2598, (x, y) => x < 2 && y < 4),
  glyph(0x259d, (x, y) => x >= 2 && y < 4),
  glyph(0x2596, (x, y) => x < 2 && y >= 4),
  glyph(0x2597, (x, y) => x >= 2 && y >= 4),
  glyph(0x259a, (x, y) => (x < 2) === (y < 4)),
]

export function matchCell(samples: Float32Array): CellMatch {
  const total = sumColors(samples, () => true)
  const average = divide(total, SAMPLES_PER_CELL)
  const flatError = errorAgainst(samples, () => average)

  let best = { glyph: FULL_BLOCK, foreground: average, background: average, error: flatError }
  if (flatError <= FLAT_CELL_ERROR) {
    return best
  }

  for (const { code, covers } of GLYPHS) {
    const coveredCount = covers.reduce((count, isCovered) => count + isCovered, 0)
    const coveredSum = sumColors(samples, sample => covers[sample] === 1)
    const foreground = divide(coveredSum, coveredCount)
    const background = divide(subtract(total, coveredSum), SAMPLES_PER_CELL - coveredCount)
    const error = errorAgainst(samples, sample => (covers[sample] === 1 ? foreground : background))
    if (error < best.error) {
      best = { glyph: code, foreground, background, error }
    }
  }

  return best
}

function glyph(code: number, isCovered: (x: number, y: number) => boolean): Glyph {
  const covers = new Uint8Array(SAMPLES_PER_CELL)
  for (let y = 0; y < SAMPLES_DOWN; y++) {
    for (let x = 0; x < SAMPLES_ACROSS; x++) {
      covers[y * SAMPLES_ACROSS + x] = isCovered(x, y) ? 1 : 0
    }
  }
  return { code, covers }
}

function sampleColor(samples: Float32Array, sample: number): Rgb {
  return [samples[sample * 3] ?? 0, samples[sample * 3 + 1] ?? 0, samples[sample * 3 + 2] ?? 0]
}

function sumColors(samples: Float32Array, isIncluded: (sample: number) => boolean): Rgb {
  const sum: Rgb = [0, 0, 0]
  for (let sample = 0; sample < SAMPLES_PER_CELL; sample++) {
    if (!isIncluded(sample)) {
      continue
    }
    const [red, green, blue] = sampleColor(samples, sample)
    sum[0] += red
    sum[1] += green
    sum[2] += blue
  }
  return sum
}

function errorAgainst(samples: Float32Array, expectedColor: (sample: number) => Rgb): number {
  let error = 0
  for (let sample = 0; sample < SAMPLES_PER_CELL; sample++) {
    const [red, green, blue] = sampleColor(samples, sample)
    const [expectedRed, expectedGreen, expectedBlue] = expectedColor(sample)
    error += (red - expectedRed) ** 2 + (green - expectedGreen) ** 2 + (blue - expectedBlue) ** 2
  }
  return error
}

function divide([red, green, blue]: Rgb, count: number): Rgb {
  return [red / count, green / count, blue / count]
}

function subtract(a: Rgb, b: Rgb): Rgb {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
