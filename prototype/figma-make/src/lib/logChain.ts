import type { LogEntry } from '@/types'
import { fakeHash } from '@/lib/hash'

export const GENESIS_HASH = '00000000'

export type NewLogEntry = Omit<LogEntry, 'id' | 'hash' | 'prev_hash'>

function rowHash(entry: Omit<LogEntry, 'hash'>): string {
  return fakeHash(JSON.stringify(entry))
}

/** Appends rows to an append-only, hash-chained log. Never mutates existing rows. */
export function appendToLog(log: LogEntry[], rows: NewLogEntry[], firstId?: number): LogEntry[] {
  const next = [...log]
  for (const row of rows) {
    const prev = next[next.length - 1]
    const id = prev ? prev.id + 1 : (firstId ?? 1)
    const unhashed = { id, ...row, prev_hash: prev ? prev.hash : GENESIS_HASH }
    next.push({ ...unhashed, hash: rowHash(unhashed) })
  }
  return next
}

/** Recomputes every row hash and link. Any edit to a row breaks the chain. */
export function verifyChain(log: LogEntry[]): boolean {
  return log.every((entry, i) => {
    const { hash, ...rest } = entry
    const expectedPrev = i === 0 ? GENESIS_HASH : log[i - 1].hash
    return entry.prev_hash === expectedPrev && rowHash(rest) === hash
  })
}
