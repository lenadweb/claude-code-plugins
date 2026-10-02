export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Usage = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limits: Limit[]
}

declare module 'claude-code' {
  interface PluginState {
    'lenadweb-usage-meter': { usage: Usage | null; now: number }
  }
}
