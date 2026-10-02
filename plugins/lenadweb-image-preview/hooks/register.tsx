import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Picture } from '../types'
import { base64ToBytes } from './base64'
import { decodeBmp } from './bmp'
import { renderClipboardCard, renderThumbnails } from './cards'
import { chafaArgs, chafaOutputToCells } from './chafa'
import { imageNumbersIn, mentionsImage } from './draft'
import { SAMPLES_ACROSS, SAMPLES_DOWN } from './glyphs'
import { CHECK_PASTEBOARD_ARGS, parsePasteboardState, parseSavedImage, savePasteboardArgs } from './pasteboard'
import { pixelsToCells } from './raster'
import { DEFAULT_BAND, fitImage, isSameSize, previewArea, thumbnailArea } from './sizing'
import type { CellBox } from './sizing'
import { canShowPixels, hasTrueColor } from './terminal'

const clipboardAtom = atom({ plugin: 'lenadweb-image-preview', key: 'clipboard' } as const, null)
const hiddenChangeCountAtom = atom({ plugin: 'lenadweb-image-preview', key: 'hiddenChangeCount' } as const, -1)
const thumbnailsAtom = atom({ plugin: 'lenadweb-image-preview', key: 'thumbnails' } as const, {})

const POLL_INTERVAL_MS = 1500
const TEMP_DIR_PREFIX = 'claude-image-preview'
const TOOL_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'

const session = {
  workDir: '',
  showsPixels: false,
  hasTrueColor: false,
  chafaPath: '',
  band: DEFAULT_BAND,
  lastChangeCount: -1,
  clipboardImage: null as Picture | null,
  isPolling: false,
  isResizing: false,
}

async function detectTerminal($: EngineInterface): Promise<void> {
  const env = {
    program: await $.env.get('TERM_PROGRAM'),
    term: await $.env.get('TERM'),
    colorTerm: await $.env.get('COLORTERM'),
    kittyWindowId: await $.env.get('KITTY_WINDOW_ID'),
  }
  session.showsPixels = canShowPixels(env)
  session.hasTrueColor = hasTrueColor(env)

  const which = await $.process.run(['/usr/bin/which', 'chafa'], { env: { PATH: TOOL_PATH } })
  session.chafaPath = which.exitCode === 0 ? which.stdout.trim() : ''
}

async function drawPicture($: EngineInterface, image: Picture, area: CellBox): Promise<Picture | null> {
  const size = fitImage(image.width, image.height, area)
  const sized: Picture = { ...image, ...size, cells: '' }
  if (session.showsPixels) {
    return sized
  }

  if (session.chafaPath) {
    const chafa = await $.process.run(chafaArgs(session.chafaPath, image.file, size, session.hasTrueColor))
    const cells = chafa.exitCode === 0 ? chafaOutputToCells(chafa.stdout, size) : null
    if (cells) {
      return { ...sized, cells }
    }
  }

  const bmpFile = `${session.workDir}/clip-${image.changeCount}-${size.columns}x${size.rows}.bmp`
  const pixelHeight = String(size.rows * SAMPLES_DOWN)
  const pixelWidth = String(size.columns * SAMPLES_ACROSS)
  const scaled = await $.process.run(['sips', '-s', 'format', 'bmp', '-z', pixelHeight, pixelWidth, image.file, '--out', bmpFile])
  if (scaled.exitCode !== 0) {
    return null
  }

  const { base64 } = await $.fs.read(bmpFile, { as: 'bytes' })
  const raster = pixelsToCells(decodeBmp(base64ToBytes(base64)))
  return { ...sized, cells: raster.cells }
}

async function readClipboard($: EngineInterface): Promise<void> {
  const check = await $.process.run(CHECK_PASTEBOARD_ARGS)
  const pasteboard = parsePasteboardState(check.stdout)
  if (!pasteboard || pasteboard.changeCount === session.lastChangeCount) {
    return
  }
  session.lastChangeCount = pasteboard.changeCount

  if (!pasteboard.hasImage) {
    session.clipboardImage = null
    await update($, clipboardAtom, () => null)
    return
  }

  const rawFile = `${session.workDir}/clip-${pasteboard.changeCount}.raw`
  const pngFile = `${session.workDir}/clip-${pasteboard.changeCount}.png`
  const save = await $.process.run(savePasteboardArgs(rawFile))
  const saved = parseSavedImage(save.stdout)
  const converted = await $.process.run(['sips', '-s', 'format', 'png', rawFile, '--out', pngFile])
  if (!saved || converted.exitCode !== 0) {
    return
  }

  session.clipboardImage = { ...saved, changeCount: pasteboard.changeCount, file: pngFile, columns: 0, rows: 0, cells: '' }
  const preview = await drawPicture($, session.clipboardImage, previewArea(session.band))
  await update($, clipboardAtom, () => preview)
}

async function syncThumbnails($: EngineInterface): Promise<void> {
  const { text } = await $.prompt.read()
  const numbers = imageNumbersIn(text)
  const current = await read($, thumbnailsAtom)
  const area = thumbnailArea(session.band, numbers.length)

  const next: Record<string, Picture> = {}
  for (const number of numbers) {
    const existing = current[number]
    if (existing) {
      next[number] = existing
    } else if (session.clipboardImage) {
      const thumbnail = await drawPicture($, session.clipboardImage, area)
      if (thumbnail) {
        next[number] = thumbnail
      }
    }
  }

  const isUnchanged =
    Object.keys(next).length === Object.keys(current).length &&
    Object.keys(next).every(number => next[number] === current[number])
  if (!isUnchanged) {
    await update($, thumbnailsAtom, () => next)
  }
}

async function poll($: EngineInterface): Promise<void> {
  if (session.isPolling || !session.workDir) {
    return
  }
  session.isPolling = true
  try {
    await readClipboard($)
    await syncThumbnails($)
  } finally {
    session.isPolling = false
  }
}

async function resizeToBand($: EngineInterface): Promise<void> {
  if (session.isResizing || session.showsPixels) {
    return
  }
  session.isResizing = true
  try {
    const clipboard = await read($, clipboardAtom)
    const preview = previewArea(session.band)
    if (clipboard && !isSameSize(clipboard, fitImage(clipboard.width, clipboard.height, preview))) {
      const redrawn = await drawPicture($, clipboard, preview)
      await update($, clipboardAtom, () => redrawn)
    }

    const thumbnails = await read($, thumbnailsAtom)
    const area = thumbnailArea(session.band, Object.keys(thumbnails).length)
    const resized: Record<string, Picture> = {}
    let hasChanged = false
    for (const [number, thumbnail] of Object.entries(thumbnails)) {
      if (isSameSize(thumbnail, fitImage(thumbnail.width, thumbnail.height, area))) {
        resized[number] = thumbnail
      } else {
        resized[number] = (await drawPicture($, thumbnail, area)) ?? thumbnail
        hasChanged = true
      }
    }
    if (hasChanged) {
      await update($, thumbnailsAtom, () => resized)
    }
  } finally {
    session.isResizing = false
  }
}

async function openInViewer($: EngineInterface, picture: Picture): Promise<void> {
  await $.process.run(['open', picture.file])
}

async function removeTempFiles($: EngineInterface): Promise<void> {
  if (!session.workDir.includes(TEMP_DIR_PREFIX)) {
    return
  }
  await $.process.run(['rm', '-rf', session.workDir])
  session.workDir = ''
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    const tempDir = await $.process.run(['mktemp', '-d', '-t', TEMP_DIR_PREFIX])
    session.workDir = tempDir.stdout.trim()
    await detectTerminal($)
    await poll($)

    $.clock.every(POLL_INTERVAL_MS, () => {
      void poll($)
    })

    return result
  })

  on('prompt.edit', async ($, e, next) => {
    const result = await next(e)
    if (mentionsImage(e.text) || mentionsImage(result.text)) {
      void poll($)
    }
    return result
  })

  on('session.end', async ($, e, next) => {
    await removeTempFiles($)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    await update($, thumbnailsAtom, () => ({}))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) {
      return next(e)
    }

    const band = { columns: e.props.bodyColumns, rows: e.props.maxRows }
    if (!isSameSize(band, session.band)) {
      session.band = band
      $.clock.after(0, () => {
        void resizeToBand($)
      })
    }

    const ui = $.ui.resolve(e)
    const thumbnails = Object.entries(await read($, thumbnailsAtom)).sort(([a], [b]) => Number(a) - Number(b))
    if (thumbnails.length > 0) {
      return renderThumbnails(ui, thumbnails, session.showsPixels, picture => {
        void openInViewer($, picture)
      })
    }

    const clipboard = await read($, clipboardAtom)
    const hiddenChangeCount = await read($, hiddenChangeCountAtom)
    if (!clipboard || clipboard.changeCount === hiddenChangeCount) {
      return next(e)
    }

    return renderClipboardCard(ui, clipboard, session.showsPixels, {
      onOpen: () => {
        void openInViewer($, clipboard)
      },
      onHide: () => {
        void update($, hiddenChangeCountAtom, () => clipboard.changeCount)
      },
    })
  })
}
