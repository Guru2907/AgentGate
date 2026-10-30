// All backend calls go through here. Vite proxies /api -> http://localhost:8000.
// Live backend by default; start the dev server with VITE_USE_MOCK=true to use the offline prototype data.
import type { LogEntry, RunRequest, RunResult, TaskId, ToolCall, Verdict } from '@/types'
import { mockRun as prototypeMockRun } from '@/lib/mockGate'
import { localTimestamp } from '@/lib/format'
import { RUN_DOCUMENTS } from '@/mock/documents'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export type { LogEntry, RunRequest, RunResult, TaskId }
export type ToolName = 'summarise' | 'send_email' | 'read_file' | 'delete_file'
export type Source = 'run' | 'inject' | 'review' | 'timeout'

/** A review waiting for a human, as returned by GET /api/review. */
export interface ApiReview {
  id: number
  audit_id: number
  task: string
  doc: string
  call: ToolCall
  call_hash: string
  status: string
  created_at: number // epoch seconds
  expires_at: number // epoch seconds
}

export interface ApiOutboxItem {
  id: number
  ts: string
  to: string
  subject: string
  attachment: string | null
  audit_id: number
}

export interface ApiReviewResult {
  id: number
  decision: { verdict: Verdict; rules: string[]; reasons: string[] }
  output: string
  audit_id: number
}

export interface ApiChain {
  ok: boolean
  rows: number
  broken_at?: number
}

export interface ApiBenchCase {
  name: string
  kind: 'clean' | 'hostile'
  task: string
  expected: Verdict
  got: Verdict
  rules: string[]
  pass: boolean
}

export interface ApiBench {
  total: number
  attacks_blocked: number
  attacks_passed: number
  clean_allowed: number
  false_alarms: number
  per_case: ApiBenchCase[]
}

export interface ApiTaskPolicy {
  allowed_tools?: string[]
  recipients?: { allow_domains?: string[]; review_domains?: string[] }
  files?: { scope?: string[] }
}

export interface ApiPolicy {
  tasks: Record<string, ApiTaskPolicy>
  global: {
    deny_tools?: string[]
    sensitive_files?: string[]
    data_labels?: Record<string, string[]>
    sensitive_patterns?: Record<string, string>
    max_calls_per_run?: number
  }
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new ApiError(resp.status, body?.detail ? String(body.detail) : `${resp.status} ${resp.statusText}`)
  }
  return resp.json() as Promise<T>
}

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

const delay = <T,>(data: T) => new Promise<T>((resolve) => setTimeout(() => resolve(data), 300))

const mockDocs = RUN_DOCUMENTS.map((d) => d.path)

/** The backend logs clock time only ('16:42:15'); the UI expects a full local timestamp. */
function withDate(ts: string): string {
  return ts.length === 8 ? `${localTimestamp().slice(0, 10)}T${ts}` : ts
}

export const api = {
  health: () => request<{ status: string }>('/health'),
  docs: () => (USE_MOCK ? delay(mockDocs) : request<string[]>('/docs')),
  run: async (req: RunRequest): Promise<RunResult> => {
    if (USE_MOCK) {
      const { result } = prototypeMockRun(req, { source: 'run' })
      return delay(result)
    }
    return post<RunResult>('/run', req)
  },
  inject: (task: string, calls: unknown[]) => post<RunResult>('/inject', { task, calls }),
  logs: async (): Promise<LogEntry[]> => {
    if (USE_MOCK) return delay([])
    const rows = await request<LogEntry[]>('/logs')
    return rows.map((r) => ({ ...r, ts: withDate(r.ts) }))
  },
  verifyLogs: () => request<ApiChain>('/logs/verify'),
  reviews: () => request<ApiReview[]>('/review'),
  decideReview: (id: number, action: 'approve' | 'deny', callHash?: string) =>
    post<ApiReviewResult>(`/review/${id}`, { action, call_hash: callHash ?? null }),
  outbox: async () => (await request<ApiOutboxItem[]>('/outbox')).map((o) => ({ ...o, ts: withDate(o.ts) })),
  policy: () => request<ApiPolicy>('/policy'),
  bench: () => post<ApiBench>('/bench'),
}
