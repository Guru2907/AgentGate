import type { ReviewItem } from '@/types'
import { REVIEW_REASON } from '@/lib/mockGate'
import { SEED_GATE_LOG } from '@/mock/gateLog'

/** Ten minutes until an unanswered review is auto-denied (fail closed). */
export const REVIEW_TIMEOUT_MS = 10 * 60 * 1000

function fromLog(logId: number, remainingMs: number, loadedAt: number): ReviewItem {
  const entry = SEED_GATE_LOG.find((e) => e.id === logId)!
  return {
    id: `review-${logId}`,
    logId,
    ts: entry.ts,
    task: entry.task,
    doc: entry.doc,
    call: { tool: entry.tool, args: entry.args },
    rule: 'R2_RECIPIENT_NOT_ALLOWED',
    reason: REVIEW_REASON,
    deadline: loadedAt + remainingMs,
  }
}

/** Seed pending items; countdowns start at 9:42 and 8:59 when the app loads. */
export function seedReviewQueue(loadedAt = Date.now()): ReviewItem[] {
  return [fromLog(40, (9 * 60 + 42) * 1000, loadedAt), fromLog(39, (8 * 60 + 59) * 1000, loadedAt)]
}
