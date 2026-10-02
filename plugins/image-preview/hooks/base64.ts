const CHUNK_SIZE = 0x8000

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK_SIZE))
  }
  return btoa(binary)
}
