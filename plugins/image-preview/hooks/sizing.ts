export type CellBox = {
  columns: number
  rows: number
}

export const DEFAULT_BAND: CellBox = { columns: 80, rows: 24 }

const CELL_HEIGHT_TO_WIDTH = 2
const CARD_FRAME_COLUMNS = 4
const CARD_FRAME_ROWS = 3
const PREVIEW_SHARE_OF_HEIGHT = 0.6
const MIN_PREVIEW: CellBox = { columns: 16, rows: 6 }
const MAX_PREVIEW_ROWS = 30
const MAX_THUMBNAIL: CellBox = { columns: 48, rows: 12 }
const MIN_THUMBNAIL_COLUMNS = 12

export function fitImage(width: number, height: number, area: CellBox): CellBox {
  const columnsForFullHeight = Math.round((area.rows * CELL_HEIGHT_TO_WIDTH * width) / height)
  const columns = Math.max(1, Math.min(area.columns, width, columnsForFullHeight))
  const rows = Math.round((columns * height) / (CELL_HEIGHT_TO_WIDTH * width))
  return { columns, rows: Math.max(1, Math.min(area.rows, rows)) }
}

export function previewArea(band: CellBox): CellBox {
  const rows = Math.floor(band.rows * PREVIEW_SHARE_OF_HEIGHT) - CARD_FRAME_ROWS
  return {
    columns: Math.max(MIN_PREVIEW.columns, band.columns - CARD_FRAME_COLUMNS),
    rows: Math.max(MIN_PREVIEW.rows, Math.min(MAX_PREVIEW_ROWS, rows)),
  }
}

export function thumbnailArea(band: CellBox, count: number): CellBox {
  const gaps = Math.max(0, count - 1)
  const columnsEach = Math.floor((band.columns - gaps) / Math.max(1, count)) - CARD_FRAME_COLUMNS
  return {
    columns: Math.max(MIN_THUMBNAIL_COLUMNS, Math.min(MAX_THUMBNAIL.columns, columnsEach)),
    rows: MAX_THUMBNAIL.rows,
  }
}

export function isSameSize(a: CellBox, b: CellBox): boolean {
  return a.columns === b.columns && a.rows === b.rows
}
