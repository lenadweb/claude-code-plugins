export type Rgb = [number, number, number]

export function packColor([red, green, blue]: Rgb): number {
  return (toByte(red) << 16) | (toByte(green) << 8) | toByte(blue)
}

function toByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
