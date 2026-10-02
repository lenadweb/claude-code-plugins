export type Pixels = {
  width: number
  height: number
  rgb: Float32Array
}

export function decodeBmp(bytes: Uint8Array): Pixels {
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dataOffset = header.getUint32(10, true)
  const width = header.getInt32(18, true)
  const signedHeight = header.getInt32(22, true)
  const bytesPerPixel = header.getUint16(28, true) / 8

  const height = Math.abs(signedHeight)
  const isTopDown = signedHeight < 0
  const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4
  const rgb = new Float32Array(width * height * 3)

  for (let y = 0; y < height; y++) {
    const fileRow = isTopDown ? y : height - 1 - y
    for (let x = 0; x < width; x++) {
      const source = dataOffset + fileRow * rowSize + x * bytesPerPixel
      const target = (y * width + x) * 3
      rgb[target] = bytes[source + 2] ?? 0
      rgb[target + 1] = bytes[source + 1] ?? 0
      rgb[target + 2] = bytes[source] ?? 0
    }
  }

  return { width, height, rgb }
}
