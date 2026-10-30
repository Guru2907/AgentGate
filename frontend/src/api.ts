// All backend calls go through here. Vite proxies /api -> http://localhost:8000.
// USE_MOCK=true returns src/mock/* data with the same shapes as the real API (see docs/ARCHITECTURE.md).
import { mockLogs, mockOutbox, mockReview } from '@/mock'

export const USE_MOCK = true

export type Verdict = 'ALLOW' | 'BLOCK' | 'REVIEW'
export type ToolName = 'summarise' | 'send_email' | 'read_file' | 'delete_file'
export type TaskName = 'summarise_resume' | 'email_company'

export interface ToolCall {
  tool: ToolName
  args: Record<string, unknown>
}

export interface RuleHit {
  rule_id: string
  severity: 'block' | 'review'
  message: string
}

export interface Egress {
  recipient: string | null
  attachment: string | null
  detected: string[]
}

export interface HumanOverride {
  by: string
  action: 'approve' | 'deny'
  at: string
}

export interface AuditRow {
  id: number
  ts: string
  run_id: string
  source: 'run' | 'inject' | 'review' | 'timeout'
  task: TaskName
  doc: string
  call: ToolCall
  verdict: Verdict
  reasons: RuleHit[]
  egress: Egress | null
  executed: boolean
  parent_audit_id: number | null
  human_override: HumanOverride | null
  prev_hash: string
  hash: string
}

export interface ReviewItem {
  id: number
  audit_id: number
  status: 'pending' | 'approved' | 'denied' | 'expired'
  created_at: string
  expires_at: string
  row: AuditRow
}

export interface OutboxItem {
  id: number
  ts: string
  to: string
  subject: string
  attachment: string | null
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
  return resp.json() as Promise<T>
}

const mock = <T,>(data: T) => Promise.resolve(data)

export const api = {
  health: () => request<{ status: string }>('/health'),
  logs: () => (USE_MOCK ? mock(mockLogs) : request<AuditRow[]>('/logs')),
  review: () => (USE_MOCK ? mock(mockReview) : request<ReviewItem[]>('/review')),
  outbox: () => (USE_MOCK ? mock(mockOutbox) : request<OutboxItem[]>('/outbox')),
  // run, inject, decideReview, bench, policy, verifyLogs: added once the 11:00 contract is frozen
}
