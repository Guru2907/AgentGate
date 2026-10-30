import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'

import { api, USE_MOCK } from '@/api'
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
  return {
    log: SEED_GATE_LOG,
    reviewQueue: seedReviewQueue(),
    outbox: SEED_OUTBOX,
    resolutions: {},
    runSession: { task: 'summarise_resume', documents: RUN_DOCUMENTS, selected: DEFAULT_DOCUMENT, phase: { kind: 'idle' } },
    backendOnline: USE_MOCK ? true : null,
  }
}

interface StoreValue {
  state: StoreState
  pendingCount: number
  recordRun: (request: RunRequest, result: RunResult, source: 'run' | 'inject') => number
  resolveReview: (itemId: string, outcome: ReviewOutcome) => void
  updateRunSession: (patch: Partial<Omit<RunSession, 'phase'>>) => void
  startRun: (source: 'run' | 'inject') => void
}

const StoreContext = createContext<StoreValue | null>(null)

const OUTCOME_TOAST: Record<ReviewOutcome, string> = {
  approve: 'Approved. Added to the mock outbox.',
  deny: 'Denied. Nothing was sent.',
  timeout: 'Auto-denied: no decision in 10 minutes.',
}

function pathToDocument(path: string): DocumentInfo {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
  const type = path.startsWith('hostile/') ? 'hostile' : path.startsWith('clean/') ? 'clean' : 'uploaded'
  return { name, type, path }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const recordRun = useCallback<StoreValue['recordRun']>((request, result, source) => {
    const lastId = stateRef.current.log[stateRef.current.log.length - 1]?.id ?? 0
    dispatch({ type: 'RECORD_RUN', request, result, source, ts: localTimestamp(), now: Date.now() })
    return lastId + result.proposed.length
  }, [])

  const resolveReview = useCallback<StoreValue['resolveReview']>((itemId, outcome) => {
    if (!stateRef.current.reviewQueue.some((r) => r.id === itemId)) return
    dispatch({ type: 'RESOLVE_REVIEW', itemId, outcome, ts: localTimestamp() })
    toast(OUTCOME_TOAST[outcome])
  }, [])

  const updateRunSession = useCallback<StoreValue['updateRunSession']>((patch) => {
    dispatch({ type: 'UPDATE_RUN_SESSION', patch })
  }, [])

  const runTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(runTimer.current), [])

  // Live docs + health + gate-log polling when USE_MOCK is false.
  useEffect(() => {
    if (USE_MOCK) return

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

    const pullLogs = () =>
      api
        .logs()
        .then((log) => {
          if (!cancelled) dispatch({ type: 'SET_LOG', log })
        })
        .catch(() => {
          /* health ping surfaces offline */
        })

    ping()
    pullLogs()
    const healthTimer = window.setInterval(ping, 10000)
    const logTimer = window.setInterval(pullLogs, LOG_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(healthTimer)
      window.clearInterval(logTimer)
    }
  }, [])

  const startRun = useCallback<StoreValue['startRun']>(
    (source) => {
      const { task, documents, selected } = stateRef.current.runSession
      const doc = documents.find((d) => d.name === selected) ?? documents[0]
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
            // Live API has no extras; keep empty so UI still renders cleanly.
            finish(result, { hiddenText: null, egress: null })
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
    [recordRun],
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
    () => ({ state, pendingCount: state.reviewQueue.length, recordRun, resolveReview, updateRunSession, startRun }),
    [state, recordRun, resolveReview, updateRunSession, startRun],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
