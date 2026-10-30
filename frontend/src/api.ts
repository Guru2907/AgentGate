// All application data is served by the authenticated backend.
import type { LogEntry, RunRequest, RunResult, TaskId, ToolCall } from '@/types'

export type { LogEntry, RunRequest, RunResult, TaskId }
export type Verdict = 'ALLOW' | 'BLOCK' | 'REVIEW'
export type ToolName = 'summarise' | 'send_email' | 'read_file' | 'delete_file'
export type Source = 'run' | 'inject' | 'review' | 'timeout'

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
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

let csrfToken: string | null = null

export function getCsrfToken(): string | null {
  return csrfToken
}

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

async function readError(resp: Response): Promise<string> {
  const messages: Record<number, string> = {
    400: 'The request could not be processed.',
    401: 'Your session has expired or the credentials are incorrect.',
    403: 'You do not have permission to do that.',
    404: 'The requested item could not be found.',
    409: 'This request conflicts with your account state.',
    422: 'Please check the submitted information.',
    429: 'Too many requests. Please wait before trying again.',
    500: 'Something went wrong. Please try again.',
    502: 'The service is temporarily unavailable.',
    503: 'The service is temporarily unavailable.',
  }
  if (resp.status === 401 && !resp.url.includes('/auth/login')) {
    setCsrfToken(null)
    window.dispatchEvent(new CustomEvent('agentgate:session-expired'))
  }
  return messages[resp.status] ?? 'The request could not be completed.'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body != null) {
    headers.set('Content-Type', 'application/json')
  }
  const method = (options.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken)
  }

  const resp = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })
  if (!resp.ok) throw new ApiError(resp.status, await readError(resp))
  if (resp.status === 204) return undefined as T
  return resp.json() as Promise<T>
}

export const api = {
  health: () => request<{ status: string }>('/health'),
  docs: () => request<string[]>('/docs'),
  run: (req: RunRequest): Promise<RunResult> =>
    request<RunResult>('/run', { method: 'POST', body: JSON.stringify(req) }),
  inject: (req: { task: string; calls: ToolCall[] }): Promise<RunResult> =>
    request<RunResult>('/inject', { method: 'POST', body: JSON.stringify(req) }),
  logs: () => request<LogEntry[]>('/logs'),
  verifyLogs: () => request<{ ok: boolean; rows: number; broken_at?: number }>('/logs/verify'),
  reviews: () => request<BackendReview[]>('/review'),
  outbox: () => request<BackendOutbox[]>('/outbox'),
  bench: () => request<BenchResult>('/bench', { method: 'POST' }),
  decideReview: (id: number, action: 'approve' | 'deny', call_hash?: string) =>
    request<{ id: number; audit_id: number }>(`/review/${id}`, {
      method: 'POST',
      body: JSON.stringify({ action, call_hash }),
    }),

  auth: {
    config: () => request<{ password_reset_enabled: boolean }>('/auth/config'),
    session: async (): Promise<AuthSession> => {
      const session = await request<AuthSession>('/auth/session')
      setCsrfToken(session.csrf_token)
      return session
    },
    signup: async (body: { full_name: string; email: string; password: string }) => {
      const result = await request<AuthPayload>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setCsrfToken(result.csrf_token)
      return result
    },
    login: async (body: { email: string; password: string }) => {
      const result = await request<AuthPayload>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setCsrfToken(result.csrf_token)
      return result
    },
    logout: async () => {
      try {
        await request<{ ok: boolean }>('/auth/logout', { method: 'POST' })
      } finally {
        setCsrfToken(null)
      }
    },
    profile: () => request<AuthUser>('/auth/profile'),
    updateProfile: (body: { full_name: string }) =>
      request<AuthUser>('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),
    changePassword: async (body: { current_password: string; new_password: string }) => {
      const result = await request<{ ok: boolean; csrf_token: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setCsrfToken(result.csrf_token)
      return result
    },
    deleteAccount: async (body: { password: string; confirmation: 'DELETE' }) => {
      await request<{ ok: boolean }>('/auth/account', { method: 'DELETE', body: JSON.stringify(body) })
      setCsrfToken(null)
    },
    requestPasswordReset: (body: { email: string }) =>
      request<{ message: string }>('/auth/password-reset', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    confirmPasswordReset: (body: { token: string; new_password: string }) =>
      request<{ ok: boolean }>('/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
}

export interface BackendReview {
  id: number
  audit_id: number
  task: string
  doc: string
  call: ToolCall
  call_hash: string
  created_at: number
  expires_at: number
}

export interface BackendOutbox {
  id: number
  ts: string
  to: string
  subject: string
  attachment: string | null
  audit_id: number
}

export interface BenchCaseResult {
  name: string
  kind: 'hostile' | 'clean'
  expected: Verdict
  got: Verdict
  rules: string[]
  pass: boolean
  trick?: string
}

export interface BenchResult {
  total: number
  attacks_blocked: number
  attacks_passed: number
  clean_allowed: number
  false_alarms: number
  per_case: BenchCaseResult[]
}
