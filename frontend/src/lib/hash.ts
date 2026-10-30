/**
 * Fake short hash for the prototype's audit log: a deterministic 8-hex string
 * derived from the row content (FNV-1a, 32-bit). MOCK ONLY, not cryptographic.
 */
export function fakeHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
