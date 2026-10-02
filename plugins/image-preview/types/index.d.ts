export type Picture = {
  changeCount: number
  width: number
  height: number
  format: string
  file: string
  columns: number
  rows: number
  cells: string
}

declare module 'claude-code' {
  interface PluginState {
    'image-preview': {
      clipboard: Picture | null
      hiddenChangeCount: number
      thumbnails: Record<string, Picture>
    }
  }
}
