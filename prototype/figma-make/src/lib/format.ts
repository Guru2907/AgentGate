import type { DocType, TaskId, Verdict } from '@/types'

export const TASK_LABELS: Record<TaskId, string> = {
  summarise_resume: 'Summarise resume',
  email_company: 'Email company',
}

export function taskLabel(task: string): string {
  return TASK_LABELS[task as TaskId] ?? task
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  ALLOW: 'ALLOWED',
  BLOCK: 'BLOCKED',
  REVIEW: 'NEEDS REVIEW',
}

/** 'hostile/resume_h01_hidden_email.txt' → 'resume_h01_hidden_email.txt' */
export function docName(path: string): string {
  return path.split('/').pop() ?? path
}

/** 'hostile/resume_h01_hidden_email.txt' → 'hostile' */
export function docTypeFromPath(path: string): DocType {
  const prefix = path.split('/')[0]
  return prefix === 'hostile' || prefix === 'uploaded' ? prefix : 'clean'
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Local timestamp as 'YYYY-MM-DDTHH:MM:SS'. */
export function localTimestamp(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`
}

/** Today's date at a fixed clock time, e.g. seedTimestamp('10:42:15'). */
export function seedTimestamp(clock: string): string {
  return `${localTimestamp().slice(0, 10)}T${clock}`
}

/** '2026-10-30T10:42:15' → '10:42:15' */
export function formatTime(ts: string): string {
  return ts.slice(11, 19)
}

export function formatClock(date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 'a81e09f3' → 'a81e…f3' */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 4)}…${hash.slice(-2)}`
}

/** 'R2_RECIPIENT_NOT_ALLOWED' → 'R2' */
export function ruleShortId(rule: string): string {
  return rule.split('_')[0]
}

/** Remaining ms → 'm:ss' */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${pad(total % 60)}`
}
