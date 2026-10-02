export type TerminalEnv = {
  program?: string
  term?: string
  colorTerm?: string
  kittyWindowId?: string
}

export function canShowPixels(env: TerminalEnv): boolean {
  const program = env.program?.toLowerCase()
  return program === 'ghostty' || env.term === 'xterm-kitty' || env.kittyWindowId !== undefined
}

export function hasTrueColor(env: TerminalEnv): boolean {
  const colorTerm = env.colorTerm?.toLowerCase()
  return colorTerm === 'truecolor' || colorTerm === '24bit'
}
