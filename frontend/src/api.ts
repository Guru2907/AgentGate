// All backend calls go through here. Vite proxies /api -> http://localhost:8000.
// Live backend by default; start the dev server with VITE_USE_MOCK=true to use the offline prototype data.
import type { DocumentInfo, LogEntry, RunRequest, RunResult, TaskId, ToolCall, Verdict } from '@/types'
import { mockRun as prototypeMockRun } from '@/lib/mockGate'
import { localTimestamp } from '@/lib/format'
import { RUN_DOCUMENTS } from '@/mock/documents'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export type { LogEntry, RunRequest, RunResult, TaskId }
export type ToolName = 'summarise' | 'send_email' | 'read_file' | 'delete_file'
export type Source = 'run' | 'inject' | 'review' | 'timeout'

export interface ApiUpload extends DocumentInfo {
  size_bytes: number
  hidden_findings?: string[]
}

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
  /** Red-team cases: the trick the attack used. */
  trick?: string | null
}

export interface ApiBench {
  total: number
  attacks_blocked: number
  attacks_passed: number
  clean_allowed: number
  false_alarms: number
  per_case: ApiBenchCase[]
}

/** POST /api/redteam: the bench result for an AI-invented attack batch. */
export interface ApiRedTeam extends ApiBench {
  summary_line: string
  rules_hit: Record<string, number>
  generated?: boolean
  templates?: boolean
  /** How many attacks the attacker AI actually wrote (the rest are built-in templates). */
  live_attacks?: number
  /** Why live generation fell back to templates, e.g. the AI declined or the rate limit was hit. */
  fallback_reason?: string | null
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

export type AuthUser = {
  id: number
  workspace_id: number
  full_name: string
  email: string
  created_at: string
  updated_at: string
}

export type AuthSession = {
  user: AuthUser | null
  csrf_token: string | null
  password_reset_enabled: boolean
}

export type AuthPayload = {
  user: AuthUser
  csrf_token: string
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: string
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.detail = message
  }
}

// Session cookie is HttpOnly; the CSRF token from the session/login response goes on every write.
let csrfToken: string | null = null

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!headers.has('Content-Type') && options.body != null && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }
  const method = (options.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) headers.set('X-CSRF-Token', csrfToken)

  const resp = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' })
  if (!resp.ok) {
    if (resp.status === 401 && !path.startsWith('/auth/')) {
      setCsrfToken(null)
      window.dispatchEvent(new CustomEvent('agentgate:session-expired'))
    }
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
  uploads: () => request<ApiUpload[]>('/uploads'),
  upload: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<ApiUpload>('/uploads', { method: 'POST', body })
  },
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
  redteam: (body: { n?: number; score_only?: boolean; templates?: boolean }) => post<ApiRedTeam>('/redteam', body),

  auth: {
    session: async (): Promise<AuthSession> => {
      const session = await request<AuthSession>('/auth/session')
      setCsrfToken(session.csrf_token)
      return session
    },
    signup: async (body: { full_name: string; email: string; password: string }) => {
      const result = await post<AuthPayload>('/auth/signup', body)
      setCsrfToken(result.csrf_token)
      return result
    },
    login: async (body: { email: string; password: string }) => {
      const result = await post<AuthPayload>('/auth/login', body)
      setCsrfToken(result.csrf_token)
      return result
    },
    logout: async () => {
      try {
        await post<{ ok: boolean }>('/auth/logout')
      } finally {
        setCsrfToken(null)
      }
    },
    updateProfile: (body: { full_name: string }) =>
      request<AuthUser>('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),
    changePassword: async (body: { current_password: string; new_password: string }) => {
      const result = await post<{ ok: boolean; csrf_token: string }>('/auth/change-password', body)
      setCsrfToken(result.csrf_token)
      return result
    },
    deleteAccount: async (body: { password: string; confirmation: 'DELETE' }) => {
      await request<{ ok: boolean }>('/auth/account', { method: 'DELETE', body: JSON.stringify(body) })
      setCsrfToken(null)
    },
    requestPasswordReset: (body: { email: string }) => post<{ message: string }>('/auth/password-reset', body),
    confirmPasswordReset: (body: { token: string; new_password: string }) =>
      post<{ ok: boolean }>('/auth/password-reset/confirm', body),
  },
}

/** Sprint C — hand-written test report + manual matrix (append-only). */
export interface ApiTestsHandwrittenGroup {
  total: number
  passed: number
}

export interface ApiTestsGap {
  id: string
  title: string
  note: string
  group?: string
}

export interface ApiTestsLatest {
  generated_at: string
  total: number
  passed: number
  failed: number
  xfailed: number
  skipped?: number
  handwritten: {
    total: number
    passed: number
    failed?: number
    known_gaps: number
    by_group: Record<string, ApiTestsHandwrittenGroup>
    gaps: ApiTestsGap[]
  }
  by_file: Record<string, number>
}

export interface ApiManualTestRow {
  id: string
  area: string
  scenario: string
  steps: string
  expected: string
  actual: string
  result: string
  tester: string
  date: string
}

/** GET /api/tests/latest */
export function testsLatest() {
  return request<ApiTestsLatest>('/tests/latest')
}

/** GET /api/tests/manual */
export function testsManual() {
  return request<ApiManualTestRow[]>('/tests/manual')
}
