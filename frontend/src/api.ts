// All backend calls go through here. Vite proxies /api -> http://localhost:8000.
// Types mirror backend/schemas.py exactly — keep both in sync.
// USE_MOCK=true returns src/mock/* data with the same shapes as the real API.
import { mockDocs, mockLogs, mockRun } from '@/mock'

export const USE_MOCK = true

export type Verdict = 'ALLOW' | 'BLOCK' | 'REVIEW'
export type ToolName = 'summarise' | 'send_email' | 'read_file' | 'delete_file'
export type TaskName = 'summarise_resume' | 'email_company'
export type Source = 'run' | 'inject' | 'review' | 'timeout'

export interface ToolCall {
  tool: ToolName
  args: Record<string, unknown>
}

/** Gate verdict for one call. rules[i] and reasons[i] describe the same hit. */
export interface Decision {
  verdict: Verdict
  rules: string[]
  reasons: string[]
}

export interface RunRequest {
  task: TaskName
  doc: string // path under data/, e.g. "hostile/resume_h01_hidden_email.txt"
}

/** Same index = same call. A call that did not run has output "(not executed)". */
export interface RunResult {
  proposed: ToolCall[]
  decisions: Decision[]
  outputs: string[]
}

export interface LogEntry {
  id: number
  ts: string
  task: string
  doc: string
  tool: string
  args: Record<string, unknown>
  verdict: Verdict
  rules: string[]
  reasons: string[]
  executed: boolean
  source: Source
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
  return resp.json() as Promise<T>
}

const mock = <T,>(data: T) => new Promise<T>((resolve) => setTimeout(() => resolve(data), 300))

export const api = {
  health: () => request<{ status: string }>('/health'),
  docs: () => (USE_MOCK ? mock(mockDocs) : request<string[]>('/docs')),
  run: (req: RunRequest) =>
    USE_MOCK ? mock(mockRun(req)) : request<RunResult>('/run', { method: 'POST', body: JSON.stringify(req) }),
  logs: () => (USE_MOCK ? mock(mockLogs) : request<LogEntry[]>('/logs')),
}
