import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'

import { api, ApiError, USE_MOCK, type ApiOutboxItem, type ApiReview } from '@/api'
import { useAuth } from '@/state/auth'
import type { LogEntry, LogSource, OutboxItem, ReviewItem, RunExtras, RunRequest, RunResult, TaskId } from '@/types'
import { docName, formatTime, localTimestamp } from '@/lib/format'
import { appendToLog, type NewLogEntry } from '@/lib/logChain'
import { mockRun } from '@/lib/mockGate'
import { DEFAULT_DOCUMENT, RUN_DOCUMENTS, type DocumentInfo } from '@/mock/documents'
import { SEED_GATE_LOG } from '@/mock/gateLog'
import { SEED_OUTBOX } from '@/mock/outbox'
import { REVIEW_TIMEOUT_MS, seedReviewQueue } from '@/mock/reviewQueue'

export type ReviewOutcome = 'approve' | 'deny' | 'timeout'

export interface RunOutcomeData {
  request: RunRequest
  result: RunResult
  extras: RunExtras
  source: 'run' | 'inject'
  logId: number
  outboxHadItems: boolean
}

export type RunPhase =
  | { kind: 'idle' }
  | { kind: 'loading'; request: RunRequest; source: 'run' | 'inject'; tool: string }
  | { kind: 'done'; outcome: RunOutcomeData }

export interface RunSession {
  task: TaskId
  documents: DocumentInfo[]
  selected: string
  phase: RunPhase
}

const RUN_LOADING_MS = 1400
const LOG_POLL_MS = 2000

export interface StoreState {
  log: LogEntry[]
  reviewQueue: ReviewItem[]
  outbox: OutboxItem[]
  resolutions: Record<number, number>
  runSession: RunSession
  backendOnline: boolean | null
}

type Action =
  | { type: 'RECORD_RUN'; request: RunRequest; result: RunResult; source: 'run' | 'inject'; ts: string; now: number }
  | { type: 'RESOLVE_REVIEW'; itemId: string; outcome: ReviewOutcome; ts: string }
  | { type: 'UPDATE_RUN_SESSION'; patch: Partial<RunSession> }
  | { type: 'SET_LOG'; log: LogEntry[] }
  | { type: 'SET_BACKEND'; online: boolean }
  | { type: 'SET_DOCUMENTS'; documents: DocumentInfo[] }
  | { type: 'SET_LIVE'; log: LogEntry[]; reviewQueue: ReviewItem[]; outbox: OutboxItem[] }
  | { type: 'SET_RESOLUTION'; logId: number; resolutionId: number }

const OUTCOME_ROW: Record<ReviewOutcome, Pick<NewLogEntry, 'verdict' | 'executed' | 'source' | 'rules' | 'reasons'>> = {
  approve: { verdict: 'ALLOW', executed: true, source: 'review', rules: ['H1_REVIEWER_APPROVED'], reasons: ['Approved by reviewer'] },
  deny: { verdict: 'BLOCK', executed: false, source: 'review', rules: ['H2_REVIEWER_DENIED'], reasons: ['Denied by reviewer'] },
  timeout: {
    verdict: 'BLOCK',
    executed: false,
    source: 'timeout',
    rules: ['T1_REVIEW_TIMEOUT'],
    reasons: ['Auto-denied after 10 minutes'],
  },
}

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'RECORD_RUN': {
      const { request, result, source, ts, now } = action
      const rows: NewLogEntry[] = result.proposed.map((call, i) => ({
        ts,
        task: request.task,
        doc: request.doc,
        tool: call.tool,
        args: call.args,
        verdict: result.decisions[i].verdict,
        rules: result.decisions[i].rules,
        reasons: result.decisions[i].reasons,
        executed: result.decisions[i].verdict === 'ALLOW',
        source: source as LogSource,
      }))
      const log = appendToLog(state.log, rows)
      const added = log.slice(state.log.length)
      const newReviews: ReviewItem[] = added
        .filter((e) => e.verdict === 'REVIEW')
        .map((e) => ({
          id: `review-${e.id}`,
          logId: e.id,
          ts: e.ts,
          task: e.task,
          doc: e.doc,
          call: { tool: e.tool, args: e.args },
          rule: e.rules[0],
          reason: e.reasons[0],
          deadline: now + REVIEW_TIMEOUT_MS,
        }))
      return { ...state, log, reviewQueue: [...newReviews, ...state.reviewQueue] }
    }
    case 'UPDATE_RUN_SESSION':
      return { ...state, runSession: { ...state.runSession, ...action.patch } }
    case 'SET_LOG':
      return { ...state, log: action.log }
    case 'SET_BACKEND':
      return { ...state, backendOnline: action.online }
    case 'SET_LIVE':
      return { ...state, log: action.log, reviewQueue: action.reviewQueue, outbox: action.outbox, backendOnline: true }
    case 'SET_RESOLUTION':
      return { ...state, resolutions: { ...state.resolutions, [action.logId]: action.resolutionId } }
    case 'SET_DOCUMENTS': {
      const selected = action.documents.some((d) => d.name === state.runSession.selected)
        ? state.runSession.selected
        : (action.documents[0]?.name ?? state.runSession.selected)
      return { ...state, runSession: { ...state.runSession, documents: action.documents, selected } }
    }
    case 'RESOLVE_REVIEW': {
      const item = state.reviewQueue.find((r) => r.id === action.itemId)
      if (!item) return state
      const log = appendToLog(state.log, [
        { ts: action.ts, task: item.task, doc: item.doc, tool: item.call.tool, args: item.call.args, ...OUTCOME_ROW[action.outcome] },
      ])
      const newRow = log[log.length - 1]
      const outbox =
        action.outcome === 'approve'
          ? [
              {
                id: `outbox-${newRow.id}`,
                time: formatTime(action.ts),
                to: String(item.call.args.to ?? ''),
                subject: String(item.call.args.subject ?? ''),
                attachment: docName(String(item.call.args.attachment ?? '')),
              },
              ...state.outbox,
            ]
          : state.outbox
      return {
        ...state,
        log,
        outbox,
        reviewQueue: state.reviewQueue.filter((r) => r.id !== item.id),
        resolutions: { ...state.resolutions, [item.logId]: newRow.id },
      }
    }
  }
}

function initialState(): StoreState {
  if (!USE_MOCK) {
    // Live: start empty; everything is loaded from the backend.
    return {
      log: [],
      reviewQueue: [],
      outbox: [],
      resolutions: {},
      runSession: { task: 'summarise_resume', documents: [], selected: '', phase: { kind: 'idle' } },
      backendOnline: null,
    }
  }
  return {
    log: SEED_GATE_LOG,
    reviewQueue: seedReviewQueue(),
    outbox: SEED_OUTBOX,
    resolutions: {},
    runSession: { task: 'summarise_resume', documents: RUN_DOCUMENTS, selected: DEFAULT_DOCUMENT, phase: { kind: 'idle' } },
    backendOnline: true,
  }
}

/** Live review row → UI review item; rule and reason come from the audit row that queued it. */
function toReviewItem(r: ApiReview, log: LogEntry[]): ReviewItem {
  const row = log.find((e) => e.id === r.audit_id)
  return {
    id: String(r.id),
    logId: r.audit_id,
    ts: localTimestamp(new Date(r.created_at * 1000)),
    task: r.task,
    doc: r.doc,
    call: r.call,
    rule: row?.rules[0] ?? 'R2_RECIPIENT_NOT_ALLOWED',
    reason: row?.reasons[0] ?? 'Needs human review',
    deadline: r.expires_at * 1000,
    callHash: r.call_hash,
  }
}

function toOutboxItem(o: ApiOutboxItem): OutboxItem {
  return { id: `outbox-${o.id}`, time: formatTime(o.ts), to: o.to, subject: o.subject, attachment: docName(o.attachment ?? '') }
}

interface StoreValue {
  state: StoreState
  pendingCount: number
  recordRun: (request: RunRequest, result: RunResult, source: 'run' | 'inject') => number
  resolveReview: (itemId: string, outcome: ReviewOutcome) => void
  updateRunSession: (patch: Partial<Omit<RunSession, 'phase'>>) => void
  startRun: (source: 'run' | 'inject') => void
  /** Live: reload log, reviews and outbox from the backend now. */
  /** Reloads log, reviews and outbox; resolves to the oldest-first log, or null if it failed. */
  refresh: () => Promise<LogEntry[] | null>
}

const StoreContext = createContext<StoreValue | null>(null)

const OUTCOME_TOAST: Record<ReviewOutcome, string> = {
  approve: 'Approved. Added to the outbox.',
  deny: 'Denied. Nothing was sent.',
  timeout: 'Auto-denied: no decision in 10 minutes.',
}

function pathToDocument(path: string): DocumentInfo {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
  const type = path.startsWith('hostile/') ? 'hostile' : path.startsWith('clean/') ? 'clean' : 'uploaded'
  return { name, type, path }
}

/** The backend sends extras per call; the result view shows the document's hidden text and the first email's egress. */
function runExtras(result: RunResult): RunExtras {
  const extras = result.extras ?? []
  return {
    hiddenText: extras.find((e) => e.hidden_text)?.hidden_text ?? null,
    egress: extras.find((e) => e.egress)?.egress ?? null,
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  // Data is per workspace: load it only for a signed-in user, and drop it when they sign out or switch.
  const workspaceId = useAuth().user?.workspace_id ?? null
  const stateRef = useRef(state)
  stateRef.current = state

  const recordRun = useCallback<StoreValue['recordRun']>((request, result, source) => {
    const lastId = stateRef.current.log[stateRef.current.log.length - 1]?.id ?? 0
    dispatch({ type: 'RECORD_RUN', request, result, source, ts: localTimestamp(), now: Date.now() })
    return lastId + result.proposed.length
  }, [])

  const refresh = useCallback<StoreValue['refresh']>(async () => {
    if (USE_MOCK) return null
    try {
      const [newestFirst, reviews, outbox] = await Promise.all([api.logs(), api.reviews(), api.outbox()])
      const log = [...newestFirst].reverse() // the store keeps the log oldest-first, like the offline prototype
      dispatch({
        type: 'SET_LIVE',
        log,
        reviewQueue: reviews.map((r) => toReviewItem(r, log)),
        outbox: outbox.map(toOutboxItem),
      })
      return log
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) dispatch({ type: 'SET_BACKEND', online: false })
      return null
    }
  }, [])

  const resolveReview = useCallback<StoreValue['resolveReview']>(
    (itemId, outcome) => {
      const item = stateRef.current.reviewQueue.find((r) => r.id === itemId)
      if (!item) return
      if (USE_MOCK) {
        dispatch({ type: 'RESOLVE_REVIEW', itemId, outcome, ts: localTimestamp() })
        toast(OUTCOME_TOAST[outcome])
        return
      }
      if (outcome === 'timeout') {
        // The backend auto-denies expired reviews when the queue is read.
        void refresh().then(() => toast(OUTCOME_TOAST.timeout))
        return
      }
      api
        .decideReview(Number(item.id), outcome, item.callHash)
        .then((res) => {
          dispatch({ type: 'SET_RESOLUTION', logId: item.logId, resolutionId: res.audit_id })
          if (res.decision.rules.includes('R11_APPROVAL_TAMPERED')) {
            toast.error('Blocked: the approved call was changed after review.', { description: res.decision.reasons[0] })
          } else if (res.decision.verdict === 'ALLOW') {
            toast.success('Approved. Added to the outbox.', { description: res.output })
          } else {
            toast('Denied. Nothing was sent.')
          }
        })
        .catch((err: Error) => toast.error(err.message || 'Could not record the decision'))
        .finally(() => void refresh())
    },
    [refresh],
  )

  const updateRunSession = useCallback<StoreValue['updateRunSession']>((patch) => {
    dispatch({ type: 'UPDATE_RUN_SESSION', patch })
  }, [])

  const runTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(runTimer.current), [])

  // Live docs + health + gate-log polling when USE_MOCK is false.
  useEffect(() => {
    if (USE_MOCK) return
    dispatch({ type: 'SET_LIVE', log: [], reviewQueue: [], outbox: [] })
    if (workspaceId === null) return

    let cancelled = false

    api
      .docs()
      .then((paths) => {
        if (cancelled || paths.length === 0) return
        dispatch({ type: 'SET_DOCUMENTS', documents: paths.map(pathToDocument) })
      })
      .catch(() => {
        toast.error('Could not load documents from the backend.')
      })

    const ping = () =>
      api
        .health()
        .then(() => dispatch({ type: 'SET_BACKEND', online: true }))
        .catch(() => dispatch({ type: 'SET_BACKEND', online: false }))

    const pull = () => {
      if (!cancelled) void refresh()
    }

    ping()
    pull()
    const healthTimer = window.setInterval(ping, 10000)
    const logTimer = window.setInterval(pull, LOG_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(healthTimer)
      window.clearInterval(logTimer)
    }
  }, [refresh, workspaceId])

  const startRun = useCallback<StoreValue['startRun']>(
    (source) => {
      const { task, documents, selected } = stateRef.current.runSession
      const doc = documents.find((d) => d.name === selected) ?? documents[0]
      if (!doc) return // documents not loaded yet
      const request: RunRequest = { task: source === 'inject' ? 'summarise_resume' : task, doc: doc.path }

      // Inject stays on mock until Phase 2 /api/inject lands.
      const useLive = !USE_MOCK && source === 'run'

      const finish = (result: RunResult, extras: RunExtras) => {
        window.clearTimeout(runTimer.current)
        runTimer.current = window.setTimeout(() => {
          const outboxHadItems = stateRef.current.outbox.length > 0
          const logId = recordRun(request, result, source)
          dispatch({
            type: 'UPDATE_RUN_SESSION',
            patch: { phase: { kind: 'done', outcome: { request, result, extras, source, logId, outboxHadItems } } },
          })
          const verdict = result.decisions[0]?.verdict
          const tool = result.proposed[0]?.tool ?? 'action'
          if (verdict === 'ALLOW') toast.success(`Allowed: ${tool} ran in the sandbox.`, { description: `Logged as #${logId}` })
          else if (verdict === 'BLOCK') toast.error(`Blocked: ${tool} was stopped by the gate.`, { description: `Logged as #${logId}` })
          else if (verdict === 'REVIEW') toast.warning(`Needs review: ${tool} is waiting for a human.`, { description: `Logged as #${logId}` })
        }, useLive ? 400 : RUN_LOADING_MS)
      }

      if (useLive) {
        dispatch({
          type: 'UPDATE_RUN_SESSION',
          patch: { phase: { kind: 'loading', request, source, tool: '…' } },
        })
        api
          .run(request)
          .then((result) => {
            const tool = result.proposed[0]?.tool ?? 'summarise'
            dispatch({
              type: 'UPDATE_RUN_SESSION',
              patch: { phase: { kind: 'loading', request, source, tool } },
            })
            // Reload so the new rows (and any review) appear, then point the result at the real log row.
            void refresh().then((log) => {
              // stateRef only updates on the next render, so read the id from the log just loaded.
              const newest = (log ?? stateRef.current.log).at(-1)?.id ?? 0
              window.clearTimeout(runTimer.current)
              const outboxHadItems = stateRef.current.outbox.length > 0
              dispatch({
                type: 'UPDATE_RUN_SESSION',
                patch: {
                  phase: { kind: 'done', outcome: { request, result, extras: runExtras(result), source, logId: newest, outboxHadItems } },
                },
              })
              const verdict = result.decisions.find((d) => d.verdict !== 'ALLOW')?.verdict ?? result.decisions[0]?.verdict
              const tool = result.proposed[0]?.tool ?? 'action'
              if (verdict === 'ALLOW') toast.success(`Allowed: ${tool} ran in the sandbox.`, { description: `Logged as #${newest}` })
              else if (verdict === 'BLOCK') toast.error('Blocked by the gate.', { description: `Logged as #${newest}` })
              else if (verdict === 'REVIEW') toast.warning('Needs review: waiting for a human.', { description: `Logged as #${newest}` })
            })
          })
          .catch((err: Error) => {
            dispatch({ type: 'UPDATE_RUN_SESSION', patch: { phase: { kind: 'idle' } } })
            dispatch({ type: 'SET_BACKEND', online: false })
            toast.error(err.message || 'Backend request failed')
          })
        return
      }

      const { result, extras } = mockRun(request, { source })
      dispatch({
        type: 'UPDATE_RUN_SESSION',
        patch: { phase: { kind: 'loading', request, source, tool: result.proposed[0].tool } },
      })
      finish(result, extras)
    },
    [recordRun, refresh],
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      for (const item of stateRef.current.reviewQueue) {
        if (item.deadline <= now) resolveReview(item.id, 'timeout')
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resolveReview])

  const value = useMemo<StoreValue>(
    () => ({ state, pendingCount: state.reviewQueue.length, recordRun, resolveReview, updateRunSession, startRun, refresh }),
    [state, recordRun, resolveReview, updateRunSession, startRun, refresh],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
