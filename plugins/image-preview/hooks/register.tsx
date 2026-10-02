import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Picture } from '../types'

const clipboardAtom = atom({ plugin: 'image-preview', key: 'clipboard' } as const, null)
const hiddenIdAtom = atom({ plugin: 'image-preview', key: 'hiddenId' } as const, -1)
const attachedAtom = atom({ plugin: 'image-preview', key: 'attached' } as const, {})

const POLL_MS = 1500
const IMAGE_TAG = /\[Image #(\d+)\]/g
const SEARCH_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'

const SUB_X = 4
const SUB_Y = 8
const SUBPIXELS = SUB_X * SUB_Y
const FLAT_CELL_ERROR = 9600
const DITHER_STRENGTH = 0.75
const DITHER_MIN_ERROR = 12
const MAX_PREVIEW_ROWS = 30
const MAX_THUMB = { columns: 48, rows: 12 }
const FALLBACK_BAND = { columns: 80, rows: 24 }
const DEFAULT_COLOR = 0x01000000
const FULL_BLOCK = 0x2588

const PASTEBOARD_SCRIPT = `ObjC.import('AppKit')
function run(argv) {
  const pb = $.NSPasteboard.generalPasteboard
  const types = ObjC.deepUnwrap(pb.types) || []
  const type = ['public.png', 'public.tiff', 'public.jpeg', 'public.heic'].find(t => types.includes(t))
  if (argv[0] !== 'save' || !type) return pb.changeCount + ' ' + (type || '-')
  pb.dataForType(type).writeToFileAtomically(argv[1], true)
  const reps = $.NSImage.alloc.initWithContentsOfFile(argv[1]).representations
  let w = 0, h = 0
  for (let i = 0; i < reps.count; i++) {
    const r = reps.objectAtIndex(i)
    if (r.pixelsWide > w) { w = r.pixelsWide; h = r.pixelsHigh }
  }
  return [pb.changeCount, type, w, h].join(' ')
}`

type Box = { columns: number; rows: number }
type Rgb = [number, number, number]
type Glyph = { code: number; mask: Uint8Array }

function glyph(code: number, covers: (x: number, y: number) => boolean): Glyph {
  const mask = new Uint8Array(SUBPIXELS)
  for (let y = 0; y < SUB_Y; y++) for (let x = 0; x < SUB_X; x++) mask[y * SUB_X + x] = covers(x, y) ? 1 : 0
  return { code, mask }
}

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

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255]

const PALETTE: Rgb[] = (() => {
  const colors: Rgb[] = []
  for (const r of CUBE_LEVELS) for (const g of CUBE_LEVELS) for (const b of CUBE_LEVELS) colors.push([r, g, b])
  for (let i = 0; i < 24; i++) colors.push([8 + i * 10, 8 + i * 10, 8 + i * 10])
  return colors
})()

const SYSTEM_COLORS: Rgb[] = [
  [0, 0, 0], [205, 0, 0], [0, 205, 0], [205, 205, 0], [0, 0, 238], [205, 0, 205], [0, 205, 205], [229, 229, 229],
  [127, 127, 127], [255, 0, 0], [0, 255, 0], [255, 255, 0], [92, 92, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
]

function xtermColor(index: number): Rgb {
  if (index < 16) return SYSTEM_COLORS[index] ?? [0, 0, 0]
  return PALETTE[index - 16] ?? [0, 0, 0]
}

function nearestPaletteColor([r, g, b]: Rgb): Rgb {
  let best: Rgb = [0, 0, 0]
  let bestDistance = Infinity
  for (const color of PALETTE) {
    const mean = (r + color[0]) / 2
    const dr = r - color[0]
    const dg = g - color[1]
    const db = b - color[2]
    const distance = (2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db
    if (distance < bestDistance) {
      bestDistance = distance
      best = color
    }
  }
  return best
}

function packColor([r, g, b]: Rgb): number {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)
}

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function encodeCells(words: Uint32Array): string {
  return encodeBase64(new Uint8Array(words.buffer, words.byteOffset, words.byteLength))
}

function readBmp(bmp: Uint8Array): { width: number; height: number; pixels: Float32Array } {
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength)
  const offset = view.getUint32(10, true)
  const width = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const bytesPerPixel = view.getUint16(28, true) / 8
  const height = Math.abs(rawHeight)
  const stride = Math.ceil((width * bytesPerPixel) / 4) * 4
  const pixels = new Float32Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    const row = rawHeight < 0 ? y : height - 1 - y
    for (let x = 0; x < width; x++) {
      const at = offset + row * stride + x * bytesPerPixel
      const i = (y * width + x) * 3
      pixels[i] = bmp[at + 2] ?? 0
      pixels[i + 1] = bmp[at + 1] ?? 0
      pixels[i + 2] = bmp[at] ?? 0
    }
  }
  return { width, height, pixels }
}

function channel(sub: Float32Array, p: number, c: number): number {
  return sub[p * 3 + c] ?? 0
}

function distance(sub: Float32Array, p: number, [r, g, b]: Rgb): number {
  return (channel(sub, p, 0) - r) ** 2 + (channel(sub, p, 1) - g) ** 2 + (channel(sub, p, 2) - b) ** 2
}

function splitCell(sub: Float32Array): { code: number; fg: Rgb; bg: Rgb } {
  let tr = 0
  let tg = 0
  let tb = 0
  for (let p = 0; p < SUBPIXELS; p++) {
    tr += channel(sub, p, 0)
    tg += channel(sub, p, 1)
    tb += channel(sub, p, 2)
  }
  const flat: Rgb = [tr / SUBPIXELS, tg / SUBPIXELS, tb / SUBPIXELS]

  let flatError = 0
  for (let p = 0; p < SUBPIXELS; p++) flatError += distance(sub, p, flat)
  let best = { code: FULL_BLOCK, fg: flat, bg: flat, error: flatError }
  if (flatError <= FLAT_CELL_ERROR) return best

  for (const { code, mask } of GLYPHS) {
    let fr = 0
    let fgreen = 0
    let fb = 0
    let fgCount = 0
    for (let p = 0; p < SUBPIXELS; p++) {
      if (!mask[p]) continue
      fgCount++
      fr += channel(sub, p, 0)
      fgreen += channel(sub, p, 1)
      fb += channel(sub, p, 2)
    }
    const bgCount = SUBPIXELS - fgCount
    const fg: Rgb = [fr / fgCount, fgreen / fgCount, fb / fgCount]
    const bg: Rgb = [(tr - fr) / bgCount, (tg - fgreen) / bgCount, (tb - fb) / bgCount]
    let error = 0
    for (let p = 0; p < SUBPIXELS && error < best.error; p++) error += distance(sub, p, mask[p] ? fg : bg)
    if (error < best.error) best = { code, fg, bg, error }
  }
  return best
}

function renderCells(image: { width: number; height: number; pixels: Float32Array }, isPalette: boolean): Box & { cells: string } {
  const columns = Math.floor(image.width / SUB_X)
  const rows = Math.floor(image.height / SUB_Y)
  const words = new Uint32Array(columns * rows * 3)
  const carry = new Float32Array((columns + 2) * (rows + 1) * 3)
  const sub = new Float32Array(SUBPIXELS * 3)
  const carryAt = (x: number, y: number) => (y * (columns + 2) + x + 1) * 3

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const k = carryAt(x, y)
      for (let sy = 0; sy < SUB_Y; sy++) {
        for (let sx = 0; sx < SUB_X; sx++) {
          const from = ((y * SUB_Y + sy) * image.width + x * SUB_X + sx) * 3
          const to = (sy * SUB_X + sx) * 3
          for (let c = 0; c < 3; c++) sub[to + c] = Math.max(0, Math.min(255, (image.pixels[from + c] ?? 0) + (carry[k + c] ?? 0)))
        }
      }

      const cell = splitCell(sub)
      const fg = isPalette ? nearestPaletteColor(cell.fg) : cell.fg
      const bg = isPalette ? nearestPaletteColor(cell.bg) : cell.bg
      const i = (y * columns + x) * 3
      words[i] = cell.code
      words[i + 1] = packColor(fg)
      words[i + 2] = packColor(bg)

      if (!isPalette) continue
      const glyphMask = GLYPHS.find(g => g.code === cell.code)?.mask
      let er = 0
      let eg = 0
      let eb = 0
      for (let p = 0; p < SUBPIXELS; p++) {
        const [r, g, b] = !glyphMask || glyphMask[p] ? fg : bg
        er += ((channel(sub, p, 0) - r) * DITHER_STRENGTH) / SUBPIXELS
        eg += ((channel(sub, p, 1) - g) * DITHER_STRENGTH) / SUBPIXELS
        eb += ((channel(sub, p, 2) - b) * DITHER_STRENGTH) / SUBPIXELS
      }
      const spread = (dx: number, dy: number, weight: number) => {
        const at = carryAt(x + dx, y + dy)
        carry[at] = (carry[at] ?? 0) + er * weight
        carry[at + 1] = (carry[at + 1] ?? 0) + eg * weight
        carry[at + 2] = (carry[at + 2] ?? 0) + eb * weight
      }
      if (Math.abs(er) + Math.abs(eg) + Math.abs(eb) < DITHER_MIN_ERROR * DITHER_STRENGTH) continue
      spread(1, 0, 7 / 16)
      spread(-1, 1, 3 / 16)
      spread(0, 1, 5 / 16)
      spread(1, 1, 1 / 16)
    }
  }
  return { columns, rows, cells: encodeCells(words) }
}

function parseChafa(text: string, box: Box): string | null {
  const words = new Uint32Array(box.columns * box.rows * 3)
  const lines = text.replace(/\r/g, '').split('\n').filter(line => line.length > 0)
  if (lines.length < box.rows) return null

  for (let y = 0; y < box.rows; y++) {
    const line = lines[y] ?? ''
    let fg = DEFAULT_COLOR
    let bg = DEFAULT_COLOR
    let isInverse = false
    let x = 0
    for (let i = 0; i < line.length && x < box.columns; ) {
      if (line[i] === '\u001b') {
        const end = line.indexOf('m', i)
        if (end === -1) break
        const codes = line.slice(i + 2, end).split(';').map(Number)
        for (let j = 0; j < codes.length; j++) {
          const code = codes[j]
          if (code === 0) {
            fg = DEFAULT_COLOR
            bg = DEFAULT_COLOR
            isInverse = false
          } else if (code === 7) isInverse = true
          else if (code === 27) isInverse = false
          else if (code === 39) fg = DEFAULT_COLOR
          else if (code === 49) bg = DEFAULT_COLOR
          else if ((code === 38 || code === 48) && codes[j + 1] === 5) {
            const color = packColor(xtermColor(codes[j + 2] ?? 0))
            if (code === 38) fg = color
            else bg = color
            j += 2
          } else if ((code === 38 || code === 48) && codes[j + 1] === 2) {
            const color = packColor([codes[j + 2] ?? 0, codes[j + 3] ?? 0, codes[j + 4] ?? 0])
            if (code === 38) fg = color
            else bg = color
            j += 4
          }
        }
        i = end + 1
        continue
      }
      const point = line.codePointAt(i) ?? 0x20
      i += point > 0xffff ? 2 : 1
      const isDrawable = point >= 0x20 && point <= 0xffff
      const k = (y * box.columns + x) * 3
      words[k] = isDrawable ? point : FULL_BLOCK
      words[k + 1] = isInverse ? bg : fg
      words[k + 2] = isInverse ? fg : bg
      x++
    }
    for (; x < box.columns; x++) {
      const k = (y * box.columns + x) * 3
      words[k] = 0x20
      words[k + 1] = DEFAULT_COLOR
      words[k + 2] = DEFAULT_COLOR
    }
  }
  return encodeCells(words)
}

function fit(width: number, height: number, box: Box): Box {
  const columns = Math.max(1, Math.min(box.columns, Math.round((box.rows * 2 * width) / height), width))
  const rows = Math.max(1, Math.round((columns * height) / (2 * width)))
  return { columns, rows: Math.min(rows, box.rows) }
}

function previewBox(band: Box): Box {
  return {
    columns: Math.max(16, band.columns - 4),
    rows: Math.max(6, Math.min(MAX_PREVIEW_ROWS, Math.floor(band.rows / 2) - 3)),
  }
}

function thumbBox(band: Box, count: number): Box {
  const share = Math.floor((band.columns - (count - 1)) / Math.max(1, count)) - 4
  return { columns: Math.max(12, Math.min(MAX_THUMB.columns, share)), rows: MAX_THUMB.rows }
}

function tagNumbers(text: string): string[] {
  return [...text.matchAll(IMAGE_TAG)].map(m => m[1] ?? '').filter(Boolean)
}

function formatSize(width: number, height: number, type: string): string {
  return `${width}×${height} · ${type.replace('public.', '').toUpperCase()}`
}

function sameBox(p: Picture, box: Box): boolean {
  return p.columns === box.columns && p.rows === box.rows
}

let workDir = ''
let hasGraphics = false
let isPalette = true
let chafaPath = ''
let band: Box = FALLBACK_BAND
let lastChangeCount = -1
let latest: Picture | null = null
let isPolling = false
let isRefitting = false

async function renderPicture($: EngineInterface, from: Picture, box: Box): Promise<Picture | null> {
  const { columns, rows } = fit(from.width, from.height, box)
  const sized = { ...from, columns, rows, cells: '' }
  if (hasGraphics) return sized

  if (chafaPath) {
    const drawn = await $.process.run([
      chafaPath, '--format', 'symbols', '--size', `${columns}x${rows}`, '--stretch',
      '--colors', isPalette ? '256' : 'full', '--dither', isPalette ? 'diffusion' : 'none',
      '--symbols', 'block+border+space', '--animate', 'off', '--polite', 'on', from.file,
    ])
    const cells = drawn.exitCode === 0 ? parseChafa(drawn.stdout, { columns, rows }) : null
    if (cells) return { ...sized, cells }
  }

  const out = `${workDir}/clip-${from.id}-${columns}x${rows}.bmp`
  const converted = await $.process.run([
    'sips', '-s', 'format', 'bmp', '-z', String(rows * SUB_Y), String(columns * SUB_X), from.file, '--out', out,
  ])
  if (converted.exitCode !== 0) return null
  const { base64 } = await $.fs.read(out, { as: 'bytes' })
  return { ...sized, ...renderCells(readBmp(decodeBase64(base64)), isPalette) }
}

async function readClipboard($: EngineInterface): Promise<void> {
  const checked = await $.process.run(['osascript', '-l', 'JavaScript', '-e', PASTEBOARD_SCRIPT, 'check'])
  const [countText, type] = checked.stdout.trim().split(' ')
  const changeCount = Number(countText)
  if (!Number.isFinite(changeCount) || changeCount === lastChangeCount) return
  lastChangeCount = changeCount

  if (!type || type === '-') {
    latest = null
    await update($, clipboardAtom, () => null)
    return
  }

  const raw = `${workDir}/clip-${changeCount}.raw`
  const file = `${workDir}/clip-${changeCount}.png`
  const saved = await $.process.run(['osascript', '-l', 'JavaScript', '-e', PASTEBOARD_SCRIPT, 'save', raw])
  const [, savedType, w, h] = saved.stdout.trim().split(' ')
  const width = Number(w)
  const height = Number(h)
  const converted = await $.process.run(['sips', '-s', 'format', 'png', raw, '--out', file])
  if (!savedType || !(width > 0) || !(height > 0) || converted.exitCode !== 0) return

  latest = { id: changeCount, type: savedType, width, height, file, columns: 0, rows: 0, cells: '' }
  const picture = await renderPicture($, latest, previewBox(band))
  await update($, clipboardAtom, () => picture)
}

async function readDraft($: EngineInterface): Promise<void> {
  const { text } = await $.prompt.read()
  const numbers = tagNumbers(text)
  const attached = await read($, attachedAtom)
  const box = thumbBox(band, numbers.length)
  const kept: Record<string, Picture> = {}
  for (const n of numbers) {
    const existing = attached[n]
    if (existing) kept[n] = existing
    else if (latest) {
      const thumb = await renderPicture($, latest, box)
      if (thumb) kept[n] = thumb
    }
  }
  const isSame =
    Object.keys(kept).length === Object.keys(attached).length && Object.keys(kept).every(n => attached[n] === kept[n])
  if (!isSame) await update($, attachedAtom, () => kept)
}

async function poll($: EngineInterface): Promise<void> {
  if (isPolling || !workDir) return
  isPolling = true
  try {
    await readClipboard($)
    await readDraft($)
  } finally {
    isPolling = false
  }
}

async function refit($: EngineInterface): Promise<void> {
  if (isRefitting || hasGraphics) return
  isRefitting = true
  try {
    const clipboard = await read($, clipboardAtom)
    if (clipboard && !sameBox(clipboard, fit(clipboard.width, clipboard.height, previewBox(band)))) {
      const picture = await renderPicture($, clipboard, previewBox(band))
      await update($, clipboardAtom, () => picture)
    }

    const attached = await read($, attachedAtom)
    const entries = Object.entries(attached)
    const box = thumbBox(band, entries.length)
    const refitted: Record<string, Picture> = {}
    let isChanged = false
    for (const [n, p] of entries) {
      if (sameBox(p, fit(p.width, p.height, box))) refitted[n] = p
      else {
        refitted[n] = (await renderPicture($, p, box)) ?? p
        isChanged = true
      }
    }
    if (isChanged) await update($, attachedAtom, () => refitted)
  } finally {
    isRefitting = false
  }
}

async function detectTerminal($: EngineInterface): Promise<void> {
  const program = ((await $.env.get('TERM_PROGRAM')) ?? '').toLowerCase()
  const term = (await $.env.get('TERM')) ?? ''
  const colorTerm = ((await $.env.get('COLORTERM')) ?? '').toLowerCase()
  hasGraphics = program === 'ghostty' || term === 'xterm-kitty' || (await $.env.get('KITTY_WINDOW_ID')) !== undefined
  isPalette = colorTerm !== 'truecolor' && colorTerm !== '24bit'
  const found = await $.process.run(['/usr/bin/which', 'chafa'], { env: { PATH: SEARCH_PATH } })
  chafaPath = found.exitCode === 0 ? found.stdout.trim() : ''
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const made = await $.process.run(['mktemp', '-d', '-t', 'claude-image-preview'])
    workDir = made.stdout.trim()
    await detectTerminal($)
    await poll($)
    $.clock.every(POLL_MS, () => {
      void poll($)
    })
    return result
  })

  on('prompt.edit', async ($, e, next) => {
    const result = await next(e)
    if (result.text.includes('[Image #') || e.text.includes('[Image #')) void poll($)
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    await update($, attachedAtom, () => ({}))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)

    if (e.props.bodyColumns !== band.columns || e.props.maxRows !== band.rows) {
      band = { columns: e.props.bodyColumns, rows: e.props.maxRows }
      $.clock.after(0, () => {
        void refit($)
      })
    }

    const attached = await read($, attachedAtom)
    const clipboard = await read($, clipboardAtom)
    const hiddenId = await read($, hiddenIdAtom)
    const { Box, Text, Button, Raster, Image } = $.ui.resolve(e)

    const picture = (key: string, p: Picture, alt: string) =>
      hasGraphics || !p.cells ? (
        <Image key={key} source={{ file: p.file, format: 'png' }} columns={p.columns} rows={p.rows} alt={alt} />
      ) : (
        <Raster key={key} columns={p.columns} rows={p.rows} cells={p.cells} />
      )

    const thumbs = Object.entries(attached).sort(([a], [b]) => Number(a) - Number(b))
    if (thumbs.length > 0) {
      return (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {thumbs.map(([n, p]) => (
            <Box key={`thumb-${n}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
              {picture(`thumb-picture-${n}`, p, `Image #${n}`)}
              <Box flexDirection="row" gap={1}>
                <Text color="suggestion" bold>{`#${n}`}</Text>
                <Text dimColor wrap="truncate-end">{`${p.width}×${p.height}`}</Text>
                <Button
                  key={`open-${n}`}
                  label="↗ Open"
                  plain
                  dimColor
                  hotkey={Number(n) < 10 ? n : undefined}
                  onPress={() => $.process.run(['open', p.file])}
                />
              </Box>
            </Box>
          ))}
        </Box>
      )
    }

    const isPasted = clipboard !== null && Object.values(attached).some(p => p.id === clipboard.id)
    if (clipboard === null || clipboard.id === hiddenId || isPasted) return next(e)

    return (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} alignSelf="flex-start">
        {picture('clipboard-picture', clipboard, 'Clipboard image')}
        <Box flexDirection="row" gap={1}>
          <Text bold>Clipboard</Text>
          <Text dimColor>{formatSize(clipboard.width, clipboard.height, clipboard.type)}</Text>
          <Text dimColor>·</Text>
          <Text color="suggestion">ctrl+v</Text>
          <Text dimColor>to paste</Text>
          <Button key="open" label="↗ Open" plain dimColor hotkey="o" onPress={() => $.process.run(['open', clipboard.file])} />
          <Button key="hide" label="✕ Hide" plain dimColor hotkey="h" onPress={() => update($, hiddenIdAtom, () => clipboard.id)} />
        </Box>
      </Box>
    )
  })
}
