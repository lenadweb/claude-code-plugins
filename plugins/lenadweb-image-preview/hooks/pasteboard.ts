export const PASTEBOARD_SCRIPT = `ObjC.import('AppKit')
function run(argv) {
  const pasteboard = $.NSPasteboard.generalPasteboard
  const types = ObjC.deepUnwrap(pasteboard.types) || []
  const imageType = ['public.png', 'public.tiff', 'public.jpeg', 'public.heic'].find(type => types.includes(type))
  if (argv[0] !== 'save' || !imageType) return pasteboard.changeCount + ' ' + (imageType || '-')
  pasteboard.dataForType(imageType).writeToFileAtomically(argv[1], true)
  const representations = $.NSImage.alloc.initWithContentsOfFile(argv[1]).representations
  let width = 0, height = 0
  for (let i = 0; i < representations.count; i++) {
    const representation = representations.objectAtIndex(i)
    if (representation.pixelsWide > width) { width = representation.pixelsWide; height = representation.pixelsHigh }
  }
  return [pasteboard.changeCount, imageType, width, height].join(' ')
}`

const NO_IMAGE = '-'

export type PasteboardState = {
  changeCount: number
  hasImage: boolean
}

export type SavedImage = {
  format: string
  width: number
  height: number
}

export function parsePasteboardState(output: string): PasteboardState | null {
  const [changeCount, imageType] = output.trim().split(' ')
  const count = Number(changeCount)
  if (!Number.isFinite(count)) {
    return null
  }
  return { changeCount: count, hasImage: Boolean(imageType) && imageType !== NO_IMAGE }
}

export function parseSavedImage(output: string): SavedImage | null {
  const [, imageType, width, height] = output.trim().split(' ')
  const image = { format: toFormatName(imageType ?? ''), width: Number(width), height: Number(height) }
  if (!imageType || !(image.width > 0) || !(image.height > 0)) {
    return null
  }
  return image
}

function toFormatName(imageType: string): string {
  return imageType.replace('public.', '').toUpperCase()
}
