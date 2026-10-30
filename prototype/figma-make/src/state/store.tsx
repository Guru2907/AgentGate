import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'

import type { LogEntry, LogSource, OutboxItem, ReviewItem, RunExtras, RunRequest, RunResult, TaskId } from '@/types'
import { docName, formatTime, localTimestamp } from '@/lib/format'
import { appendToLog, type NewLogEntry } from '@/lib/logChain'
import { mockRun } from '@/lib/mockGate'
import { DEFAULT_DOCUMENT, RUN_DOCUMENTS, type DocumentInfo } from '@/mock/documents'
import { SEED_GATE_LOG } from '@/mock/gateLog'
import { SEED_OUTBOX } from '@/mock/outbox'
import { REVIEW_TIMEOUT_MS, seedReviewQueue } from '@/mock/reviewQueue'

export type ReviewOutcome = 'approve' | 'deny' | 'timeout'

/** A finished Run Task run, as shown in the result column. */
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

/** Run Task inputs and last result, kept in the store so they survive page changes. */
export interface RunSession {
  task: TaskId
  documents: DocumentInfo[]
  selected: string
  phase: RunPhase
}

/** Simulated time for the AI to read the document and the gate to decide. */
const RUN_LOADING_MS = 1400

export interface StoreState {
  /** Append-only, hash-chained audit log, oldest first. */
  log: LogEntry[]
  reviewQueue: ReviewItem[]
  outbox: OutboxItem[]
  /** Original REVIEW log id → id of the row that recorded the human/timeout decision. */
  resolutions: Record<number, number>
  runSession: RunSession
}

type Action =
  | { type: 'RECORD_RUN'; request: RunRequest; result: RunResult; source: 'run' | 'inject'; ts: string; now: number }
  | { type: 'RESOLVE_REVIEW'; itemId: string; outcome: ReviewOutcome; ts: string }
  | { type: 'UPDATE_RUN_SESSION'; patch: Partial<RunSession> }

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
  }
}

interface StoreValue {
  state: StoreState
  pendingCount: number
  /** Appends one log row per proposed call; returns the id of the last row. */
  recordRun: (request: RunRequest, result: RunResult, source: 'run' | 'inject') => number
  resolveReview: (itemId: string, outcome: ReviewOutcome) => void
  updateRunSession: (patch: Partial<Omit<RunSession, 'phase'>>) => void
  /** Sends the selected task + document (or an injected call) to the mock gate; finishes after RUN_LOADING_MS. */
  startRun: (source: 'run' | 'inject') => void
}

const StoreContext = createContext<StoreValue | null>(null)

const OUTCOME_TOAST: Record<ReviewOutcome, string> = {
  approve: 'Approved. Added to the mock outbox.',
  deny: 'Denied. Nothing was sent.',
  timeout: 'Auto-denied: no decision in 10 minutes.',
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

  // The run timer lives here (not in the page) so a run finishes and is logged even if the user changes page.
  const runTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(runTimer.current), [])

  const startRun = useCallback<StoreValue['startRun']>(
    (source) => {
      const { task, documents, selected } = stateRef.current.runSession
      const doc = documents.find((d) => d.name === selected) ?? documents[0]
      // Inject always targets the "Summarise resume" policy.
      const request: RunRequest = { task: source === 'inject' ? 'summarise_resume' : task, doc: doc.path }
      const { result, extras } = mockRun(request, { source })
      dispatch({ type: 'UPDATE_RUN_SESSION', patch: { phase: { kind: 'loading', request, source, tool: result.proposed[0].tool } } })
      window.clearTimeout(runTimer.current)
      runTimer.current = window.setTimeout(() => {
        const outboxHadItems = stateRef.current.outbox.length > 0
        const logId = recordRun(request, result, source)
        dispatch({
          type: 'UPDATE_RUN_SESSION',
          patch: { phase: { kind: 'done', outcome: { request, result, extras, source, logId, outboxHadItems } } },
        })
      }, RUN_LOADING_MS)
    },
    [recordRun],
  )

  // Fail closed: auto-deny any review whose deadline has passed, on every screen.
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
