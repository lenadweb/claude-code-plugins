export type Picture = {
  id: number
  width: number
  height: number
  type: string
  file: string
  columns: number
  rows: number
  cells: string
}

declare module 'claude-code' {
  interface PluginState {
    'image-preview': {
      clipboard: Picture | null
      hiddenId: number
      attached: Record<string, Picture>
    }
  }
}
