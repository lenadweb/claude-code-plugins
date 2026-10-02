const IMAGE_TAG = /\[Image #(\d+)\]/g

export function imageNumbersIn(draft: string): string[] {
  return [...draft.matchAll(IMAGE_TAG)].map(match => match[1] ?? '').filter(Boolean)
}

export function mentionsImage(draft: string): boolean {
  return draft.includes('[Image #')
}
