import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, CircleX, Copy, Minus, Search, SearchX, TriangleAlert, X, type LucideIcon } from 'lucide-react'

import { api, type ApiChain, type ApiLogExplanation, type ApiRuleGuideEntry, type ApiRuleStatus } from '@/api'
import type { LogEntry, Verdict } from '@/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BreakableText } from '@/components/BreakableText'
import { ChainChip } from '@/components/ChainChip'
import { CornerMarks } from '@/components/CornerMarks'
import { EgressPreview } from '@/components/EgressPreview'
import { EmptyState } from '@/components/EmptyState'
import { FieldList } from '@/components/FieldList'
import { PageHeader } from '@/components/PageHeader'
import { SourceBadge } from '@/components/SourceBadge'
import { VerdictBadge } from '@/components/VerdictBadge'
import { docName, formatTime, ruleShortId, shortHash, taskLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'

type Filter = 'all' | Verdict

const TABS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ALLOW', label: 'Allowed' },
  { value: 'BLOCK', label: 'Blocked' },
  { value: 'REVIEW', label: 'Needs review' },
]

function rulesHit(entry: LogEntry): string {
  if (entry.rules.length === 0) return '—'
  return entry.rules.map((r) => ruleShortId(r) + (entry.verdict === 'REVIEW' ? ' (review)' : '')).join(', ')
}

function ExecutedText({ entry, resolvedBy }: { entry: LogEntry; resolvedBy?: number }) {
  if (entry.executed) return <span>Yes</span>
  if (entry.verdict !== 'REVIEW') return <span className="text-muted-foreground">No</span>
  if (resolvedBy) return <span className="text-muted-foreground">Decided in #{resolvedBy}</span>
  return <span className="text-review-ink font-medium">Waiting</span>
}

function LiveStatus({ online }: { online: boolean | null }) {
  if (online === false) {
    return (
      <span className="text-blocked-ink inline-flex items-center gap-1.5 text-xs">
        <span aria-hidden className="bg-blocked size-1.5 rounded-full" />
        Backend offline
      </span>
    )
  }
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden className="bg-allowed ag-pulse-soft size-1.5 rounded-full" />
      Live · updates every 2 s
    </span>
  )
}

/** `focusLogId` opens that entry on mount (the page remounts on every navigation). */
export function GateLog({ focusLogId = null }: { focusLogId?: number | null }) {
  const { state } = useStore()
  const [tab, setTab] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(focusLogId)
  const [dialogOpen, setDialogOpen] = useState(focusLogId !== null)
  // Rows added after mount animate in; seeded rows don't.
  const [initialMaxId] = useState(() => state.log[state.log.length - 1]?.id ?? 0)

  const newestFirst = useMemo(() => [...state.log].reverse(), [state.log])
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: state.log.length, ALLOW: 0, BLOCK: 0, REVIEW: 0 }
    for (const e of state.log) c[e.verdict]++
    return c
  }, [state.log])

  const q = query.trim().toLowerCase()
  const rows = newestFirst.filter(
    (e) =>
      (tab === 'all' || e.verdict === tab) &&
      (!q || e.doc.toLowerCase().includes(q) || e.tool.includes(q) || String(e.id) === q.replace(/^#/, '')),
  )
  const filtered = tab !== 'all' || q.length > 0

  // The newest row is highlighted until the user picks another.
  const highlightedId = selectedId ?? newestFirst[0]?.id
  const selected = state.log.find((e) => e.id === highlightedId)

  function open(entry: LogEntry) {
    setSelectedId(entry.id)
    setDialogOpen(true)
  }

  function reset() {
    setQuery('')
    setTab('all')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Gate Log"
        description="Every action the AI tried, and what the gate decided."
        actions={
          <>
            <ChainChip />
            <LiveStatus online={state.backendOnline} />
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Filter)} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="max-w-full justify-start overflow-x-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label} <span className="tabular-nums">({counts[t.value]})</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="relative w-full sm:w-72">
            <Search aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="Search by document, tool or log id"
              placeholder="Search document, tool or #id…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              className="pr-8 pl-8"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md outline-none focus-visible:ring-[3px]"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <TabsContent value={tab} className="flex flex-col gap-2">
          {rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              message={
                state.log.length === 0
                  ? 'No actions logged yet. Run a task to see the gate decide.'
                  : 'No actions match. Clear the search or switch tabs.'
              }
              action={
                filtered && (
                  <Button variant="outline" size="sm" onClick={reset}>
                    Reset filters
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="card-edge bg-card relative rounded-xl border">
                <CornerMarks marks={[{ corner: 'tl', tone: 'violet' }, { corner: 'br', tone: 'orange' }]} />
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Time</TableHead>
                      <TableHead className="hidden lg:table-cell">Task</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead className="hidden sm:table-cell">Tool</TableHead>
                      <TableHead>Verdict</TableHead>
                      <TableHead className="hidden md:table-cell">Rules hit</TableHead>
                      <TableHead className="hidden sm:table-cell">Executed</TableHead>
                      <TableHead className="hidden xl:table-cell">Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => (
                      <TableRow
                        key={e.id}
                        tabIndex={0}
                        aria-label={`Log #${e.id}, open details`}
                        data-state={e.id === highlightedId ? 'selected' : undefined}
                        onClick={() => open(e)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault()
                            open(e)
                          }
                        }}
                        className={cn(
                          'ag-select-row focus-visible:ring-ring/50 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-inset',
                          e.id > initialMaxId && 'ag-row-reveal',
                        )}
                      >
                        <TableCell className="font-mono whitespace-nowrap">
                          <span className="sm:hidden">{formatTime(e.ts).slice(0, 5)}</span>
                          <span className="hidden sm:inline">{formatTime(e.ts)}</span>
                        </TableCell>
                        <TableCell className="hidden min-w-24 lg:table-cell xl:whitespace-nowrap">{taskLabel(e.task)}</TableCell>
                        <TableCell className="min-w-32 sm:min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono [overflow-wrap:anywhere] xl:whitespace-nowrap">
                              <BreakableText text={docName(e.doc)} />
                            </span>
                            <SourceBadge source={e.source} />
                          </span>
                          {/* Phones: tool shown under the document instead of its own column. */}
                          <span className="text-muted-foreground mt-1 block font-mono text-2xs sm:hidden">{e.tool}</span>
                        </TableCell>
                        <TableCell className="hidden font-mono sm:table-cell xl:whitespace-nowrap">
                          <BreakableText text={e.tool} />
                        </TableCell>
                        <TableCell>
                          <VerdictBadge verdict={e.verdict} />
                        </TableCell>
                        <TableCell className="hidden min-w-20 font-mono md:table-cell">{rulesHit(e)}</TableCell>
                        <TableCell className="hidden min-w-16 sm:table-cell">
                          <ExecutedText entry={e} resolvedBy={state.resolutions[e.id]} />
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden font-mono whitespace-nowrap xl:table-cell">
                          {shortHash(e.hash)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-muted-foreground px-1 text-xs tabular-nums">
                Showing {rows.length} of {state.log.length} actions
                {filtered && (
                  <>
                    {' · '}
                    <button type="button" onClick={reset} className="hover:text-foreground underline-offset-4 hover:underline">
                      Reset filters
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen && !!selected} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          {selected && <LogDetail key={selected.id} entry={selected} resolvedBy={state.resolutions[selected.id]} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast(`${label} copied.`)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to clipboard.')
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Copy ${label}`} onClick={copy} className="size-7">
          {copied ? <Check className="text-allowed size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied' : `Copy ${label}`}</TooltipContent>
    </Tooltip>
  )
}

function HashValue({ value, label }: { value?: string; label: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex items-center justify-between gap-2">
      <span className="min-w-0 break-all">{value}</span>
      <CopyButton value={value} label={label} />
    </span>
  )
}

const CHECK_STATUS: Record<ApiRuleStatus, { label: string; Icon: LucideIcon; className: string }> = {
  passed: { label: 'Passed', Icon: Check, className: 'text-allowed-ink' },
  failed: { label: 'Failed', Icon: CircleX, className: 'text-blocked-ink' },
  review: { label: 'Needs review', Icon: TriangleAlert, className: 'text-review-ink' },
  not_applicable: { label: 'Not relevant', Icon: Minus, className: 'text-muted-foreground' },
}

function actionText(entry: LogEntry): string {
  if (entry.tool === 'send_email') {
    const recipient = typeof entry.args.to === 'string' ? entry.args.to : 'an unknown address'
    return `tried to email ${recipient}`
  }
  if (entry.tool === 'read_file' || entry.tool === 'delete_file') {
    const path = typeof entry.args.path === 'string' ? entry.args.path : 'an unknown file'
    return `tried to ${entry.tool === 'read_file' ? 'read' : 'delete'} ${path}`
  }
  if (entry.tool === 'summarise') return 'tried to summarize a document'
  return `proposed ${entry.tool}`
}

function outcomeText(entry: LogEntry): string {
  if (entry.verdict === 'BLOCK') return `AgentGate blocked it. ${entry.tool === 'send_email' ? 'Nothing was sent.' : 'Nothing ran.'}`
  if (entry.verdict === 'REVIEW') return 'AgentGate asked a person to review it. Nothing ran yet.'
  return entry.executed ? 'AgentGate allowed it and the mock tool ran.' : 'AgentGate allowed it, but the tool did not run.'
}

function happenedText(entry: LogEntry): string {
  const action = actionText(entry)
  if (entry.source === 'review' || entry.source === 'timeout') {
    return `${humanDecisionLabel(entry)} The reviewed call ${action}. ${outcomeText(entry)}`
  }
  const origin = entry.source === 'inject'
    ? 'A direct test call'
    : `While checking ${docName(entry.doc)}, the AI`
  return `${origin} ${action}. ${outcomeText(entry)}`
}

function humanDecisionLabel(entry: LogEntry): string {
  if (entry.rules.includes('HUMAN_APPROVED')) return 'A person approved the action.'
  if (entry.rules.includes('HUMAN_DENIED')) return 'A person denied the action.'
  if (entry.rules.includes('REVIEW_TIMEOUT') || entry.source === 'timeout') return 'The review timer ran out; the action was stopped.'
  if (entry.rules.includes('R11_APPROVAL_TAMPERED')) return 'The approval check found that the action had changed.'
  return `Human review ended with ${entry.verdict}.`
}

function GuideValue({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{label}</dt>
      <dd className="text-sm leading-relaxed">{value}</dd>
    </div>
  )
}

function RuleCheckRow({
  check,
  guide,
}: {
  check: ApiLogExplanation['checks'][number]
  guide?: ApiRuleGuideEntry
}) {
  const state = CHECK_STATUS[check.status]
  const Icon = state.Icon
  return (
    <details className="group rounded-lg border bg-card px-4 py-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Icon aria-hidden className={`size-4 shrink-0 ${state.className}`} />
        <span className="min-w-0 flex-1 font-medium">{guide?.title ?? check.rule}</span>
        <span className={`text-xs font-semibold ${state.className}`}>{state.label}</span>
        <code className="text-muted-foreground w-full text-xs sm:w-auto">{check.rule}</code>
      </summary>
      <div className="mt-3 space-y-3 border-t pt-3">
        <p className="text-sm leading-relaxed">{check.detail}</p>
        {guide && (
          <dl className="grid gap-3 sm:grid-cols-2">
            <GuideValue label="What it means" value={guide.plain} />
            <GuideValue label="Why it matters" value={guide.why} />
            <GuideValue label="Example" value={guide.example} />
            <GuideValue label="What to do" value={guide.what_to_do} />
          </dl>
        )}
      </div>
    </details>
  )
}

function LogDetail({ entry, resolvedBy }: { entry: LogEntry; resolvedBy?: number }) {
  const [explanation, setExplanation] = useState<ApiLogExplanation | null>(null)
  const [guide, setGuide] = useState<Record<string, ApiRuleGuideEntry>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chain, setChain] = useState<ApiChain | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.explainLog(entry.id), api.rules()])
      .then(([detail, allRules]) => {
        if (!active) return
        setExplanation(detail)
        setGuide(allRules)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load the explanation.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [entry.id])

  async function verifyChain() {
    try {
      const result = await api.verifyLogs()
      setChain(result)
      toast(result.ok ? 'The audit chain is intact.' : `The audit chain has a problem at row #${result.broken_at}.`)
    } catch {
      toast.error('Could not verify the audit chain.')
    }
  }

  const timelineRows = explanation
    ? [...explanation.run_steps, explanation.row]
        .filter((step) => step.id !== explanation.resolution?.id)
        .sort((left, right) => left.id - right.id)
    : [entry]
  const resolvedRule = explanation?.resolution
    ? explanation.resolution.rules[0]
    : null

  return (
    <>
      <DialogHeader className="border-b px-6 py-5 pr-14">
        <span className="eyebrow">Log entry #{entry.id}</span>
        <DialogTitle className="flex items-center gap-3">
          <VerdictBadge verdict={entry.verdict} size="lg" />
        </DialogTitle>
        <DialogDescription className="font-mono text-xs">{entry.ts.replace('T', ' ')}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-7 px-6 py-5">
        {loading && <p className="text-muted-foreground text-sm">Loading the decision explanation…</p>}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load this explanation</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <section className="space-y-3">
          <h3 className="font-semibold">What happened</h3>
          <p className="bg-muted rounded-lg border p-4 text-sm leading-relaxed">
            {happenedText(entry)}
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Step by step</h3>
          <ol className="border-muted ml-2 space-y-0 border-l pl-5">
            <li className="relative py-2 text-sm leading-relaxed before:absolute before:top-3 before:-left-[1.65rem] before:size-2 before:rounded-full before:bg-muted-foreground">
              {entry.source === 'inject' ? 'A direct test call was sent to the gate.' : `The document ${docName(entry.doc)} was read.`}
            </li>
            {explanation?.hidden_text && (
              <li className="relative py-2 text-sm leading-relaxed before:absolute before:top-3 before:-left-[1.65rem] before:size-2 before:rounded-full before:bg-review">
                A hidden instruction was found in the document.
              </li>
            )}
            {timelineRows.map((step) => {
              const isHuman = step.source === 'review' || step.source === 'timeout'
              return (
                <li
                  key={step.id}
                  className="relative py-2 text-sm leading-relaxed before:absolute before:top-3 before:-left-[1.65rem] before:size-2 before:rounded-full before:bg-muted-foreground"
                >
                  {isHuman ? (
                    <>{humanDecisionLabel(step)} <span className="text-muted-foreground">Log #{step.id}</span></>
                  ) : (
                    <>
                      {step.source === 'inject' ? 'A test call was submitted' : `The AI proposed ${step.tool}`}
                      {' · '}the gate checked it · <VerdictBadge verdict={step.verdict} />
                    </>
                  )}
                </li>
              )
            })}
            {explanation?.resolution && (
              <li className="relative py-2 text-sm leading-relaxed before:absolute before:top-3 before:-left-[1.65rem] before:size-2 before:rounded-full before:bg-muted-foreground">
                {humanDecisionLabel(explanation.resolution)} <span className="text-muted-foreground">Log #{explanation.resolution.id}</span>
              </li>
            )}
            {entry.verdict === 'REVIEW' && !explanation?.resolution && entry.source !== 'review' && entry.source !== 'timeout' && (
              <li className="relative py-2 text-sm leading-relaxed before:absolute before:top-3 before:-left-[1.65rem] before:size-2 before:rounded-full before:bg-review">
                Waiting for a person to review this action.
              </li>
            )}
          </ol>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">The checks</h3>
            <span className="text-muted-foreground text-xs">All 11 checks, with plain-language explanations</span>
          </div>
          {explanation && (
            <div className="space-y-2">
              {explanation.checks.map((check) => (
                <RuleCheckRow key={check.rule} check={check} guide={guide[check.rule] ?? explanation.guide[check.rule]} />
              ))}
            </div>
          )}
          {explanation?.policy_section && (
            <details className="rounded-lg border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">Current policy for this task</summary>
              <pre className="bg-muted mt-3 overflow-x-auto rounded-lg border p-3 text-xs whitespace-pre-wrap">
                {JSON.stringify(explanation.policy_section, null, 2)}
              </pre>
            </details>
          )}
          {resolvedRule && guide[resolvedRule] && (
            <p className="text-muted-foreground text-xs">Review result: {guide[resolvedRule].plain}</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">What would have left</h3>
          {explanation?.egress ? (
            <div className="rounded-lg border px-4">
              <EgressPreview egress={explanation.egress} />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">This call did not try to send an email.</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Where the attack came from</h3>
          {explanation?.hidden_text ? (
            <p className="rounded-lg border border-review/50 bg-review-soft p-4 text-sm leading-relaxed text-review-ink">
              <mark className="rounded bg-review/25 px-1 text-inherit">{explanation.hidden_text}</mark>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              {entry.source === 'inject' ? 'This call came directly from the test input, not a document.' : 'No hidden instruction was found in the document.'}
            </p>
          )}
        </section>

        <details className="rounded-lg border px-4 py-3">
          <summary className="cursor-pointer font-semibold">For auditors</summary>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Raw call JSON</span>
              <pre className="bg-muted overflow-x-auto rounded-lg border p-3 text-xs whitespace-pre-wrap break-words">
                {JSON.stringify({ tool: entry.tool, args: entry.args }, null, 2)}
              </pre>
            </div>
            <FieldList
              className="bg-muted rounded-lg border p-3"
              fields={[
                { label: 'hash', value: <HashValue value={entry.hash} label="hash" />, mono: true },
                { label: 'previous hash', value: <HashValue value={entry.prev_hash} label="previous hash" />, mono: true },
                { label: 'Source', value: entry.source, mono: true },
                { label: 'Resolved by', value: resolvedBy ? `Log #${resolvedBy}` : explanation?.resolution ? `Log #${explanation.resolution.id}` : '—' },
              ]}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={verifyChain}>Verify chain</Button>
              {chain && (
                <span className={`text-sm ${chain.ok ? 'text-allowed-ink' : 'text-blocked-ink'}`}>
                  {chain.ok ? `Verified ${chain.rows} rows.` : `Broken at row #${chain.broken_at}.`}
                </span>
              )}
            </div>
          </div>
        </details>

      </div>
    </>
  )
}
