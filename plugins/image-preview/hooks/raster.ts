import { bytesToBase64 } from './base64'
import type { Pixels } from './bmp'
import { packColor } from './color'
import { matchCell, SAMPLES_ACROSS, SAMPLES_DOWN, SAMPLES_PER_CELL } from './glyphs'

export type RasterCells = {
  columns: number
  rows: number
  cells: string
}

export function pixelsToCells(pixels: Pixels): RasterCells {
  const columns = Math.floor(pixels.width / SAMPLES_ACROSS)
  const rows = Math.floor(pixels.height / SAMPLES_DOWN)
  const words = new Uint32Array(columns * rows * 3)

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const match = matchCell(cellSamples(pixels, column, row))
      const cell = (row * columns + column) * 3
      words[cell] = match.glyph
      words[cell + 1] = packColor(match.foreground)
      words[cell + 2] = packColor(match.background)
    }
  }

  return { columns, rows, cells: encodeCells(words) }
}

export function encodeCells(words: Uint32Array): string {
  return bytesToBase64(new Uint8Array(words.buffer, words.byteOffset, words.byteLength))
}

function cellSamples(pixels: Pixels, column: number, row: number): Float32Array {
  const samples = new Float32Array(SAMPLES_PER_CELL * 3)
  for (let y = 0; y < SAMPLES_DOWN; y++) {
    for (let x = 0; x < SAMPLES_ACROSS; x++) {
      const pixelX = column * SAMPLES_ACROSS + x
      const pixelY = row * SAMPLES_DOWN + y
      const source = (pixelY * pixels.width + pixelX) * 3
      const target = (y * SAMPLES_ACROSS + x) * 3
      samples[target] = pixels.rgb[source] ?? 0
      samples[target + 1] = pixels.rgb[source + 1] ?? 0
      samples[target + 2] = pixels.rgb[source + 2] ?? 0
    }
  }
  return samples
}
