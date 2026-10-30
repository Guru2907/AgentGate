// All backend calls go through here. Vite proxies /api -> http://localhost:8000.
// USE_MOCK=true returns prototype mockGate data with the same shapes as the real API.
import type { LogEntry, RunRequest, RunResult, TaskId } from '@/types'
import { mockRun as prototypeMockRun } from '@/lib/mockGate'
import { RUN_DOCUMENTS } from '@/mock/documents'

export const USE_MOCK = true

export type { LogEntry, RunRequest, RunResult, TaskId }
export type Verdict = 'ALLOW' | 'BLOCK' | 'REVIEW'
export type ToolName = 'summarise' | 'send_email' | 'read_file' | 'delete_file'
export type Source = 'run' | 'inject' | 'review' | 'timeout'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
  return resp.json() as Promise<T>
}

const delay = <T,>(data: T) => new Promise<T>((resolve) => setTimeout(() => resolve(data), 300))

const mockDocs = RUN_DOCUMENTS.map((d) => d.path)

export const api = {
  health: () => request<{ status: string }>('/health'),
  docs: () => (USE_MOCK ? delay(mockDocs) : request<string[]>('/docs')),
  run: async (req: RunRequest): Promise<RunResult> => {
    if (USE_MOCK) {
      const { result } = prototypeMockRun(req, { source: 'run' })
      return delay(result)
    }
    return request<RunResult>('/run', { method: 'POST', body: JSON.stringify(req) })
  },
  logs: (): Promise<LogEntry[]> => {
    if (USE_MOCK) return delay([])
    return request<LogEntry[]>('/logs')
  },
}
