// Backend contract types. Keep in sync with the AgentGate API.

export type Verdict = 'ALLOW' | 'BLOCK' | 'REVIEW' // internal values
// Display labels: ALLOW → "ALLOWED", BLOCK → "BLOCKED", REVIEW → "NEEDS REVIEW"

export type ToolName = 'summarise' | 'send_email' | 'read_file' | 'delete_file'

export interface ToolCall {
  tool: ToolName
  args: Record<string, unknown>
}

export interface Decision {
  verdict: Verdict
  rules: string[]
  reasons: string[]
} // rules[i] ↔ reasons[i]

export interface RunRequest {
  task: string
  doc: string
} // task: 'summarise_resume' | 'email_company'; doc: path like 'hostile/resume_h01_hidden_email.txt'

export interface CallExtras {
  hidden_text: string | null
  egress: { recipient: string | null; attachment: string | null; detected: string[] } | null
}

export interface RunResult {
  proposed: ToolCall[]
  decisions: Decision[]
  outputs: string[]
  /** Per-call insight from the backend (hidden text in the document, what an email would take out). */
  extras?: CallExtras[]
} // same index = same call; blocked output = "(not executed)"

export interface LogEntry {
  id: number
  ts: string
  task: string
  doc: string
  tool: ToolName
  args: Record<string, unknown>
  verdict: Verdict
  rules: string[]
  reasons: string[]
  executed: boolean
  source: 'run' | 'inject' | 'review' | 'timeout'
  /** Backend adds these later for the hash chain. */
  hash?: string
  prev_hash?: string
}

export interface DocumentInfo {
  name: string
  type: DocType
  /** RunRequest.doc value, such as a path returned by the backend. */
  path: string
}

// ---------------------------------------------------------------------------
// UI-only types (not part of the backend contract)
// ---------------------------------------------------------------------------

export type TaskId = 'summarise_resume' | 'email_company'

export type DocType = 'clean' | 'hostile' | 'uploaded'

export type LogSource = LogEntry['source']

export interface EgressInfo {
  recipient: string | null
  attachment: string | null
  detected: string[]
}

export interface RunExtras {
  hiddenText: string | null
  egress: EgressInfo | null
}

export interface ReviewItem {
  id: string
  /** Log row that created this review item (never edited). */
  logId: number
  ts: string
  task: string
  doc: string
  call: ToolCall
  rule: string
  reason: string
  /** Epoch ms when the item is auto-denied. */
  deadline: number
  /** Live API: hash of the exact call shown, sent back on approve so a swapped call is refused (R11). */
  callHash?: string
}

export interface OutboxItem {
  id: string
  time: string
  to: string
  subject: string
  attachment: string
}
