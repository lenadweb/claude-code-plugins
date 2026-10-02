export type Rgb = [number, number, number]

export const TERMINAL_DEFAULT_COLOR = 0x01000000

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255]

const SYSTEM_COLORS: Rgb[] = [
  [0, 0, 0], [205, 0, 0], [0, 205, 0], [205, 205, 0],
  [0, 0, 238], [205, 0, 205], [0, 205, 205], [229, 229, 229],
  [127, 127, 127], [255, 0, 0], [0, 255, 0], [255, 255, 0],
  [92, 92, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
]

export function packColor([red, green, blue]: Rgb): number {
  return (toByte(red) << 16) | (toByte(green) << 8) | toByte(blue)
}

export function xtermColor(index: number): Rgb {
  if (index < 16) {
    return SYSTEM_COLORS[index] ?? [0, 0, 0]
  }
  if (index < 232) {
    const cube = index - 16
    return [cubeLevel(Math.floor(cube / 36)), cubeLevel(Math.floor(cube / 6) % 6), cubeLevel(cube % 6)]
  }
  const gray = 8 + (index - 232) * 10
  return [gray, gray, gray]
}

function cubeLevel(step: number): number {
  return CUBE_LEVELS[step] ?? 0
}

function toByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
