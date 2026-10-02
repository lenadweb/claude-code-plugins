import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Picture } from '../types'

const clipboardAtom = atom({ plugin: 'image-preview', key: 'clipboard' } as const, null)
const hiddenIdAtom = atom({ plugin: 'image-preview', key: 'hiddenId' } as const, -1)
const attachedAtom = atom({ plugin: 'image-preview', key: 'attached' } as const, {})

const POLL_MS = 1500
const PREVIEW_BOX = { columns: 72, rows: 18 }
const THUMB_BOX = { columns: 36, rows: 9 }
const IMAGE_TAG = /\[Image #(\d+)\]/g

const QUADRANTS = [
  0x20, 0x2597, 0x2596, 0x2584, 0x259d, 0x2590, 0x259e, 0x259f,
  0x2598, 0x259a, 0x258c, 0x2599, 0x2580, 0x259c, 0x259b, 0x2588,
]
const FLAT_CELL_ERROR = 1200

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

type Source = { id: number; type: string; width: number; height: number; file: string }

function fit(width: number, height: number, box: { columns: number; rows: number }) {
  const columns = Math.max(1, Math.min(box.columns, Math.round((box.rows * 2 * width) / height)))
  const rows = Math.max(1, Math.round((columns * height) / (2 * width)))
  return { columns, rows }
}

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function bmpToCells(bmp: Uint8Array): { columns: number; rows: number; cells: string } {
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength)
  const offset = view.getUint32(10, true)
  const width = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const bytesPerPixel = view.getUint16(28, true) / 8
  const height = Math.abs(rawHeight)
  const isTopDown = rawHeight < 0
  const stride = Math.ceil((width * bytesPerPixel) / 4) * 4

  const channels = (x: number, y: number): [number, number, number] => {
    const row = isTopDown ? y : height - 1 - y
    const at = offset + row * stride + x * bytesPerPixel
    return [bmp[at + 2] ?? 0, bmp[at + 1] ?? 0, bmp[at] ?? 0]
  }

  const columns = Math.floor(width / 2)
  const rows = Math.floor(height / 2)
  const words = new Uint32Array(columns * rows * 3)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const px = [
        channels(x * 2, y * 2),
        channels(x * 2 + 1, y * 2),
        channels(x * 2, y * 2 + 1),
        channels(x * 2 + 1, y * 2 + 1),
      ]
      const best = splitCell(px)
      const i = (y * columns + x) * 3
      words[i] = QUADRANTS[best.mask] ?? 0x2588
      words[i + 1] = best.fg
      words[i + 2] = best.bg
    }
  }
  return { columns, rows, cells: encodeBase64(new Uint8Array(words.buffer)) }
}

function splitCell(px: [number, number, number][]): { mask: number; fg: number; bg: number } {
  let best = { mask: 15, fg: 0, bg: 0, error: Infinity }
  for (let mask = 15; mask >= 8; mask--) {
    const fg = [0, 0, 0]
    const bg = [0, 0, 0]
    let fgCount = 0
    let bgCount = 0
    for (let p = 0; p < 4; p++) {
      const isFg = (mask >> (3 - p)) & 1
      const color = px[p] ?? [0, 0, 0]
      const sum = isFg ? fg : bg
      sum[0] = (sum[0] ?? 0) + color[0]
      sum[1] = (sum[1] ?? 0) + color[1]
      sum[2] = (sum[2] ?? 0) + color[2]
      if (isFg) fgCount++
      else bgCount++
    }
    const fgMean = fg.map(c => c / Math.max(1, fgCount))
    const bgMean = bg.map(c => c / Math.max(1, bgCount))
    let error = 0
    for (let p = 0; p < 4; p++) {
      const mean = (mask >> (3 - p)) & 1 ? fgMean : bgMean
      const color = px[p] ?? [0, 0, 0]
      for (let c = 0; c < 3; c++) error += ((color[c] ?? 0) - (mean[c] ?? 0)) ** 2
    }
    if (error < best.error) {
      best = { mask, fg: packColor(fgMean), bg: packColor(bgCount ? bgMean : fgMean), error }
    }
    if (mask === 15 && error <= FLAT_CELL_ERROR) break
  }
  return best
}

function packColor([r = 0, g = 0, b = 0]: number[]): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

function tagNumbers(text: string): string[] {
  return [...text.matchAll(IMAGE_TAG)].map(m => m[1] ?? '').filter(Boolean)
}

function formatSize(width: number, height: number, type: string): string {
  const format = type.replace('public.', '').toUpperCase()
  return `${width}×${height} · ${format}`
}

let workDir = ''
let hasGraphics = false
let lastChangeCount = -1
let source: Source | null = null
let isPolling = false

async function renderPicture($: EngineInterface, from: Source, box: { columns: number; rows: number }): Promise<Picture | null> {
  const { columns, rows } = fit(from.width, from.height, box)
  const picture = { id: from.id, width: from.width, height: from.height, type: from.type, file: from.file, columns, rows }
  if (hasGraphics) return { ...picture, cells: '' }

  const out = `${workDir}/clip-${from.id}-${columns}x${rows}.bmp`
  const converted = await $.process.run(['sips', '-s', 'format', 'bmp', '-z', String(rows * 2), String(columns * 2), from.file, '--out', out])
  if (converted.exitCode !== 0) return null
  const { base64 } = await $.fs.read(out, { as: 'bytes' })
  return { ...picture, ...bmpToCells(decodeBase64(base64)) }
}

async function detectGraphics($: EngineInterface): Promise<boolean> {
  const program = ((await $.env.get('TERM_PROGRAM')) ?? '').toLowerCase()
  const term = (await $.env.get('TERM')) ?? ''
  return program === 'ghostty' || term === 'xterm-kitty' || (await $.env.get('KITTY_WINDOW_ID')) !== undefined
}

async function poll($: EngineInterface) {
  if (isPolling || !workDir) return
  isPolling = true
  try {
    const checked = await $.process.run(['osascript', '-l', 'JavaScript', '-e', PASTEBOARD_SCRIPT, 'check'])
    const [countText, type] = checked.stdout.trim().split(' ')
    const changeCount = Number(countText)

    if (Number.isFinite(changeCount) && changeCount !== lastChangeCount) {
      lastChangeCount = changeCount
      if (!type || type === '-') {
        source = null
        await update($, clipboardAtom, () => null)
      } else {
        const raw = `${workDir}/clip-${changeCount}.raw`
        const file = `${workDir}/clip-${changeCount}.png`
        const saved = await $.process.run(['osascript', '-l', 'JavaScript', '-e', PASTEBOARD_SCRIPT, 'save', raw])
        const [, savedType, w, h] = saved.stdout.trim().split(' ')
        const width = Number(w)
        const height = Number(h)
        const converted = await $.process.run(['sips', '-s', 'format', 'png', raw, '--out', file])
        if (savedType && width > 0 && height > 0 && converted.exitCode === 0) {
          source = { id: changeCount, type: savedType, width, height, file }
          const picture = await renderPicture($, source, PREVIEW_BOX)
          await update($, clipboardAtom, () => picture)
        }
      }
    }

    const { text } = await $.prompt.read()
    const numbers = tagNumbers(text)
    const attached = await read($, attachedAtom)
    const kept: Record<string, Picture> = {}
    for (const n of numbers) {
      const existing = attached[n]
      if (existing) kept[n] = existing
      else if (source) {
        const thumb = await renderPicture($, source, THUMB_BOX)
        if (thumb) kept[n] = thumb
      }
    }
    const isSame =
      Object.keys(kept).length === Object.keys(attached).length && Object.keys(kept).every(n => attached[n] === kept[n])
    if (!isSame) await update($, attachedAtom, () => kept)
  } finally {
    isPolling = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const made = await $.process.run(['mktemp', '-d', '-t', 'claude-image-preview'])
    workDir = made.stdout.trim()
    hasGraphics = await detectGraphics($)
    await poll($)
    $.clock.every(POLL_MS, () => {
      void poll($)
    })
    return result
  })

  on('prompt.edit', async ($, e, next) => {
    const result = await next(e)
    if (IMAGE_TAG.test(result.text) || IMAGE_TAG.test(e.text)) void poll($)
    IMAGE_TAG.lastIndex = 0
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    await update($, attachedAtom, () => ({}))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)

    const attached = await read($, attachedAtom)
    const clipboard = await read($, clipboardAtom)
    const hiddenId = await read($, hiddenIdAtom)
    const { Box, Text, Button, Raster, Image } = $.ui.resolve(e)

    const picture = (key: string, p: Picture, alt: string) =>
      hasGraphics ? (
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
