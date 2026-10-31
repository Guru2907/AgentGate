import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CircleCheck, FileLock, Inbox, Play, RotateCcw, ScrollText, Send, ShieldCheck, ShieldX, TriangleAlert, Upload, UserCheck } from 'lucide-react'

import type { RunResult, TaskId, ToolCall, Verdict } from '@/types'
import { api, USE_MOCK } from '@/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DocTypeBadge } from '@/components/DocTypeBadge'
import { CornerMarks } from '@/components/CornerMarks'
import { IdleArtwork } from '@/components/IdleArtwork'
import { AllowlistCard } from '@/components/AllowlistCard'
import { EgressPreview } from '@/components/EgressPreview'
import { EmailComposer } from '@/components/EmailComposer'
import { PageHeader } from '@/components/PageHeader'
import { PipelineStrip } from '@/components/PipelineStrip'
import { RuleReasonList } from '@/components/RuleReason'
import { RulesSheet } from '@/components/RulesSheet'
import { ScreeningReport } from '@/components/ScreeningReport'
import { ToolCallBlock } from '@/components/ToolCallBlock'
import { VerdictBadge } from '@/components/VerdictBadge'
import { docName, TASK_LABELS } from '@/lib/format'
import { prefersReducedMotion } from '@/lib/usePrefersReducedMotion'
import { cn } from '@/lib/utils'
import { uploadedDocument } from '@/mock/documents'
import { RULE_TITLES } from '@/mock/rules'
import { useStore, type RunOutcomeData } from '@/state/store'

/** Below the xl breakpoint the result panel sits under the input card; bring it into view. */
function scrollResultIntoView(el: HTMLElement | null) {
  if (!el || !window.matchMedia('(max-width: 79.99rem)').matches) return
  window.setTimeout(() => {
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, 50)
}

interface RunTaskProps {
  onOpenReviewQueue: () => void
  onOpenLog: (logId: number) => void
}

export function RunTask({ onOpenReviewQueue, onOpenLog }: RunTaskProps) {
  const { state, updateRunSession, startRun } = useStore()
  const { task, documents, selected, phase } = state.runSession
  const [rulesOpen, setRulesOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [draggingFile, setDraggingFile] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLElement>(null)

  const busy = phase.kind === 'loading'
  const setTask = (t: TaskId) => updateRunSession({ task: t })
  const setSelected = (name: string) => updateRunSession({ selected: name })

  function start(source: 'run' | 'inject') {
    startRun(source)
    scrollResultIntoView(resultRef.current)
  }

  // Keyboard: Ctrl/Cmd+Enter runs the task from anywhere on the page.
  useEffect(() => {
    if (busy || task === 'email_company') return // the email composer has its own buttons
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        startRun('run')
        scrollResultIntoView(resultRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, startRun, task])

  async function addFile(file?: File) {
    if (!file) return
    if (!/\.(txt|pdf|docx)$/i.test(file.name)) {
      toast.error('Choose a PDF, DOCX, or TXT resume.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Files must be 10 MB or smaller.')
      return
    }
    if (USE_MOCK) {
      const local = uploadedDocument(file.name)
      updateRunSession({
        documents: documents.some((d) => d.path === local.path) ? documents : [...documents, local],
        selected: local.path,
      })
      toast('Offline prototype only: this file was not uploaded to the screening service.')
      return
    }

    setUploading(true)
    try {
      const result = await api.upload(file)
      const uploaded = { name: result.name, type: result.type, path: result.path } as const
      updateRunSession({
        documents: [...documents.filter((document) => document.path !== uploaded.path), uploaded],
        selected: uploaded.path,
      })
      toast.success(`${file.name} uploaded and ready to screen.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    void addFile(file)
  }

  function onDropFile(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDraggingFile(false)
    void addFile(e.dataTransfer.files?.[0])
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Run Task" description="Pick a task and a document. The AI proposes actions, the gate decides." />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[var(--spacing-input-column)_minmax(0,1fr)]">
        {/* ------------------------------ Input ------------------------------ */}
        <Card className="min-w-0">
          <CornerMarks marks={[{ corner: 'tl', tone: 'violet' }, { corner: 'br', tone: 'orange' }]} />
          <CardHeader>
            <CardTitle>Input</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-select">Task</Label>
              <Select value={task} onValueChange={(v) => setTask(v as TaskId)}>
                <SelectTrigger id="task-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_LABELS) as TaskId[]).map((id) => (
                    <SelectItem key={id} value={id}>
                      {TASK_LABELS[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label id="doc-label">Document</Label>
              {documents.length === 0 && (
                <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-sm">
                  {state.backendOnline === false
                    ? 'Could not reach the server. Check that the backend is running.'
                    : 'No documents yet. Upload a resume (PDF, DOCX or TXT) below to get started.'}
                </p>
              )}
              <RadioGroup aria-labelledby="doc-label" value={selected} onValueChange={setSelected} className="gap-2">
                {documents.map((d) => (
                  <Label
                    key={d.path}
                    htmlFor={`doc-${encodeURIComponent(d.path)}`}
                    className={cn(
                      'hover:bg-accent flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-normal transition-colors',
                      selected === d.path && 'border-border-strong bg-accent',
                    )}
                  >
                    <RadioGroupItem id={`doc-${encodeURIComponent(d.path)}`} value={d.path} />
                    <span className="min-w-0 flex-1 font-mono text-compact leading-snug break-all">{d.name}</span>
                    <DocTypeBadge type={d.type} />
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div className="flex flex-col gap-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDraggingFile(true)
                }}
                onDragLeave={() => setDraggingFile(false)}
                onDrop={onDropFile}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors',
                  draggingFile ? 'border-primary bg-primary/10' : 'border-border-strong bg-accent/40',
                )}
              >
                <Input
                  ref={fileInput}
                  type="file"
                  accept=".txt,.pdf,.docx"
                  className="hidden"
                  onChange={onFileChosen}
                  tabIndex={-1}
                />
                <Upload aria-hidden className="text-primary size-5" />
                <p className="text-sm font-medium">Drop a resume here</p>
                <p className="text-muted-foreground text-xs">PDF, DOCX, or TXT · up to 10 MB</p>
                <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy || uploading}>
                  {uploading ? 'Uploading…' : 'Browse files'}
                </Button>
                <p className="text-muted-foreground max-w-sm text-2xs leading-relaxed">
                  Live screening sends resume text to the configured model provider. Offline mode uses a local estimate.
                </p>
              </div>
              {task === 'email_company' ? (
                // Email company works as draft -> edit -> send on the right; here: which companies are allowed.
                <AllowlistCard />
              ) : (
                <Button className="w-full" size="lg" onClick={() => start('run')} disabled={busy || uploading || documents.length === 0}>
                  {busy ? <RotateCcw aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Play aria-hidden />}
                  {busy ? 'Running…' : 'Run'}
                  {!busy && <kbd className="bg-primary-foreground/15 ml-1 hidden rounded px-1.5 py-0.5 font-mono text-2xs font-medium sm:inline">Ctrl ↵</kbd>}
                </Button>
              )}
              <Button variant="link" className="h-auto self-start px-0" onClick={() => setRulesOpen(true)}>
                <FileLock aria-hidden />
                View rules for this task
              </Button>
            </div>

          </CardContent>
        </Card>

        {/* ------------------------------ Result ----------------------------- */}
        <section ref={resultRef} aria-label="Result" aria-live="polite" className="flex min-w-0 scroll-mt-20 flex-col gap-4">
          {task === 'email_company' && (
            <EmailComposer
              doc={selected || undefined}
              docLabel={documents.find((d) => d.path === selected)?.name}
              onOpenReviewQueue={onOpenReviewQueue}
              onOpenLog={onOpenLog}
            />
          )}

          {task !== 'email_company' && phase.kind === 'idle' && (
            <IdleArtwork message="Upload a resume, pick it, and press Run to see what the AI tries to do." />
          )}

          {task !== 'email_company' && phase.kind === 'loading' && (
            <>
              <PipelineCard>
                <PipelineStrip phase="loading" injected={phase.source === 'inject'} docLabel={docName(phase.request.doc)} toolLabel={phase.tool} />
              </PipelineCard>
              <p className="text-muted-foreground text-sm">
                {phase.source === 'inject' ? 'Sending the injected call to the gate…' : 'The AI is reading the document and proposing an action…'}
              </p>
              <LoadingOutcome />
            </>
          )}

          {task !== 'email_company' && phase.kind === 'done' && <RunOutcome outcome={phase.outcome} onOpenReviewQueue={onOpenReviewQueue} onOpenLog={onOpenLog} />}
        </section>
      </div>

      <RulesSheet task={task} open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  )
}

function PipelineCard({ children }: { children: ReactNode }) {
  return (
    <Card className="py-3">
      <CardContent className="px-4">
        {children}
      </CardContent>
    </Card>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>
}

/** Placeholder cards shaped like the result, so the layout doesn't jump when the verdict lands. */
function LoadingOutcome() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <Card className="gap-3 py-4">
        <CardContent className="flex flex-col gap-3 px-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
      <Card className="gap-3 py-4">
        <CardContent className="flex flex-col gap-3 px-4">
          <Skeleton className="h-3 w-24" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-32 rounded-md" />
            <Skeleton className="h-3 w-48" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface RunOutcomeProps {
  outcome: RunOutcomeData
  onOpenReviewQueue: () => void
  onOpenLog: (logId: number) => void
}

const SEVERITY: Record<Verdict, number> = { ALLOW: 0, REVIEW: 1, BLOCK: 2 }

/** The step that decides the run: the first BLOCK, else the first REVIEW, else the last call. */
function decidingStep(result: RunResult): number {
  let pick = result.decisions.length - 1
  result.decisions.forEach((d, i) => {
    if (SEVERITY[d.verdict] > SEVERITY[result.decisions[pick].verdict]) pick = i
  })
  return Math.max(0, pick)
}

function argText(call: ToolCall, key: string): string {
  const v = call.args?.[key]
  return typeof v === 'string' ? v : ''
}

/** "send an email to x@y", "delete sandbox/…": what the AI tried, in words. */
function attempted(call: ToolCall): string {
  switch (call.tool) {
    case 'send_email':
      return `send an email to ${argText(call, 'to') || 'an unknown address'}`
    case 'delete_file':
      return `delete ${argText(call, 'path') || 'a file'}`
    case 'read_file':
      return `read ${argText(call, 'path') || 'a file'}`
    case 'summarise':
      return 'summarise the document'
    default:
      return `call ${String((call as { tool?: unknown }).tool ?? 'an unknown tool')}`
  }
}

function RunOutcome({ outcome, onOpenReviewQueue, onOpenLog }: RunOutcomeProps) {
  const { request, result, extras, source, logId, outboxHadItems } = outcome
  const focus = decidingStep(result)
  const call = result.proposed[focus]
  const decision = result.decisions[focus]
  const { verdict } = decision
  const subtitle = decision.rules[0] ? RULE_TITLES[decision.rules[0]] : 'No rules hit. The call matches the task policy.'

  return (
    // Keyed on the log id so the slide-in and pulse replay for each new run.
    <div key={logId} className="flex flex-col gap-4">
      <PipelineCard>
        <PipelineStrip
          phase="done"
          verdict={verdict}
          injected={source === 'inject'}
          docLabel={docName(request.doc)}
          toolLabel={call.tool}
        />
      </PipelineCard>

      {result.agent_mode === 'live' && (
        <p className="text-muted-foreground text-xs">The live AI agent read this upload and proposed these actions; the gate judged them as-is.</p>
      )}
      {result.agent_mode === 'fallback' && (
        <p className="text-review-ink text-xs">AI agent unavailable (no key or rate limit): a simple stand-in proposed the normal action for this upload.</p>
      )}

      {request.task === 'email_company' ? (
        <EmailResult result={result} onOpenReviewQueue={onOpenReviewQueue} />
      ) : (
        <>
          {result.screening && <ScreeningReport report={result.screening} />}
          <SummaryResult result={result} focus={focus} />
        </>
      )}

      {result.proposed.length > 1 && <StepsCard result={result} focus={focus} />}

      {extras.hiddenText && !result.screening && (
        <Card className="ag-fade-up gap-2 py-3" style={{ '--ag-i': 2 } as CSSProperties}>
          <CardHeader className="px-4">
            <CardTitle>Hidden instruction found in the document</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <Alert variant="review">
              <TriangleAlert aria-hidden />
              <AlertDescription className="text-review-ink">
                <code className="font-mono text-xs leading-relaxed [overflow-wrap:anywhere]">{extras.hiddenText}</code>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      <div className={cn('grid grid-cols-1 gap-4', extras.egress && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]')}>
        <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 3 } as CSSProperties}>
          <CardContent className="flex flex-col gap-3 px-4">
            <Eyebrow>{result.proposed.length > 1 ? `Deciding call (step ${focus + 1})` : 'Proposed tool call'}</Eyebrow>
            <ToolCallBlock call={call} />
          </CardContent>
        </Card>
        {extras.egress && (
          <Card className="ag-fade-up gap-1 py-4" style={{ '--ag-i': 3 } as CSSProperties}>
            <CardContent className="flex flex-col gap-1 px-4">
              <Eyebrow>Egress preview: what would leave</Eyebrow>
              <EgressPreview egress={extras.egress} />
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 4 } as CSSProperties}>
        <CornerMarks marks={[{ corner: 'tr', tone: 'violet' }]} />
        <CardContent className="flex flex-col gap-3 px-4">
          <Eyebrow>Gate decision</Eyebrow>
          <div className="flex flex-wrap items-center gap-3">
            <VerdictBadge verdict={verdict} size="lg" glow className="ag-pulse-once" />
            <span className="text-muted-foreground text-sm">{subtitle}</span>
          </div>
          {decision.rules.length > 0 && (
            <RuleReasonList rules={decision.rules} reasons={decision.reasons} verdict={verdict} />
          )}
        </CardContent>
      </Card>

      <Alert className="ag-fade-up" style={{ '--ag-i': 5 } as CSSProperties}>
        <ShieldCheck aria-hidden />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>{alertText(verdict, logId, outboxHadItems)}</span>
          <span className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpenLog(logId)}>
              <ScrollText aria-hidden />
              Open #{logId} in Gate Log
            </Button>
            {verdict === 'REVIEW' && (
              <Button size="sm" onClick={onOpenReviewQueue}>
                <UserCheck aria-hidden />
                Open Review Queue
              </Button>
            )}
          </span>
        </AlertDescription>
      </Alert>
    </div>
  )
}

/** Summarise resume: the summary itself when allowed, otherwise what the AI tried instead. */
function SummaryResult({ result, focus }: { result: RunResult; focus: number }) {
  const i = result.proposed.findIndex((c) => c.tool === 'summarise')
  const summarised = i >= 0 && result.decisions[i].verdict === 'ALLOW' && result.decisions[focus].verdict === 'ALLOW'
  if (summarised) {
    return (
      <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 1 } as CSSProperties}>
        <CardContent className="flex flex-col gap-3 px-4">
          <Eyebrow>Result · Resume summary</Eyebrow>
          <p className="text-base leading-relaxed [overflow-wrap:anywhere]">{result.outputs[i].replace(/^Summary:\s*/, '')}</p>
          <p className="text-allowed-ink inline-flex items-center gap-1.5 text-sm">
            <CircleCheck aria-hidden className="size-4" />
            Allowed by the gate. The summary ran in the sandbox.
          </p>
        </CardContent>
      </Card>
    )
  }
  const tried = result.proposed[focus]
  const mismatch = result.decisions[focus].rules.includes('R1_TOOL_NOT_ALLOWED')
  return (
    <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 1 } as CSSProperties}>
      <CardContent className="flex flex-col gap-3 px-4">
        <Eyebrow>Result · Attack stopped</Eyebrow>
        <p className="text-base leading-relaxed">
          You asked for a summary. The AI tried to <strong className="[overflow-wrap:anywhere]">{attempted(tried)}</strong> instead.
        </p>
        {mismatch && (
          <p className="text-blocked-ink text-sm">
            Intent–action mismatch: {tried.tool} is not an action this task may take, so the gate blocked it.
          </p>
        )}
        <p className="text-muted-foreground text-sm">Nothing was executed and no summary was produced.</p>
      </CardContent>
    </Card>
  )
}

/** Which part of an allowed-tool email the gate objected to, from the rules it hit. */
function blockedPart(rules: string[]): string {
  if (rules.some((r) => r.startsWith('R9'))) return 'confidential data was read earlier in this run, so nothing may leave'
  if (rules.some((r) => r.startsWith('R2'))) return 'the recipient is not an allowed company domain'
  if (rules.some((r) => r.startsWith('R4') || r.startsWith('R3'))) return 'the attachment is outside what this task may send'
  if (rules.some((r) => r.startsWith('R5') || r.startsWith('R10'))) return 'the email carries private data'
  return 'this email breaks the task policy'
}

/** Email company: the email the AI wrote, and whether it was sent, held for review or blocked. */
function EmailResult({ result, onOpenReviewQueue }: { result: RunResult; onOpenReviewQueue: () => void }) {
  // Prefer the email that decided the run, else the first email.
  const emails = result.proposed.map((_, i) => i).filter((i) => result.proposed[i].tool === 'send_email')
  const i = emails.find((j) => result.decisions[j].verdict !== 'ALLOW') ?? emails[0]
  if (i === undefined) {
    const focus = decidingStep(result)
    return (
      <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 1 } as CSSProperties}>
        <CardContent className="flex flex-col gap-3 px-4">
          <Eyebrow>Result · Attack stopped</Eyebrow>
          <p className="text-base leading-relaxed">
            You asked to email a company. The AI tried to{' '}
            <strong className="[overflow-wrap:anywhere]">{attempted(result.proposed[focus])}</strong> instead.
          </p>
          <p className="text-muted-foreground text-sm">No email was written and nothing was executed.</p>
        </CardContent>
      </Card>
    )
  }

  const email = result.proposed[i]
  const { verdict, rules } = result.decisions[i]
  const attachment = argText(email, 'attachment')
  return (
    <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 1 } as CSSProperties}>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>Result · Email to a company</Eyebrow>
          <VerdictBadge verdict={verdict} />
        </div>
        <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg border px-4 py-3 text-sm">
          <dt className="text-muted-foreground">To</dt>
          <dd className="font-mono [overflow-wrap:anywhere]">{argText(email, 'to') || '—'}</dd>
          <dt className="text-muted-foreground">Subject</dt>
          <dd className="[overflow-wrap:anywhere]">{argText(email, 'subject') || '—'}</dd>
          <dt className="text-muted-foreground">Attachment</dt>
          <dd className="font-mono [overflow-wrap:anywhere]">{attachment ? docName(attachment) : 'none'}</dd>
          <dt className="text-muted-foreground">Body</dt>
          <dd className="text-muted-foreground line-clamp-4 whitespace-pre-line">{argText(email, 'body') || '—'}</dd>
        </dl>
        {verdict === 'ALLOW' && (
          <Alert className="border-allowed/40 bg-allowed-soft text-allowed-ink">
            <Send aria-hidden />
            <AlertDescription className="text-allowed-ink flex flex-wrap items-center justify-between gap-3">
              <span>Sent through the sandboxed mail tool. It is in the Outbox (nothing really leaves).</span>
              <Button size="sm" variant="outline" onClick={onOpenReviewQueue}>
                <Inbox aria-hidden />
                View Outbox
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {verdict === 'REVIEW' && (
          <Alert variant="review">
            <UserCheck aria-hidden />
            <AlertDescription className="text-review-ink flex flex-wrap items-center justify-between gap-3">
              <span>Held for a human. Approve or deny it in the Review Queue; it is auto-denied after 10 minutes.</span>
              <Button size="sm" onClick={onOpenReviewQueue}>
                <UserCheck aria-hidden />
                Open Review Queue
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {verdict === 'BLOCK' && (
          <Alert variant="destructive">
            <ShieldX aria-hidden />
            <AlertDescription className="text-blocked-ink">
              Not sent. Email is allowed for this task, but {blockedPart(rules)}.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

/** Multi-step runs: every call the AI made, in order, with the gate's verdict on each. */
function StepsCard({ result, focus }: { result: RunResult; focus: number }) {
  return (
    <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 2 } as CSSProperties}>
      <CardContent className="flex flex-col gap-3 px-4">
        <Eyebrow>Every step of this run</Eyebrow>
        <ol className="flex flex-col gap-2">
          {result.proposed.map((c, i) => (
            <li
              key={i}
              className={cn('flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm', i === focus && 'border-border-strong bg-accent')}
            >
              <span className="text-muted-foreground font-mono text-xs">Step {i + 1}</span>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{attempted(c)}</span>
              <span className="text-muted-foreground font-mono text-xs">{result.decisions[i].rules.map((r) => r.split('_')[0]).join(', ')}</span>
              <VerdictBadge verdict={result.decisions[i].verdict} />
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function alertText(verdict: Verdict, logId: number, outboxHadItems: boolean): string {
  switch (verdict) {
    case 'BLOCK':
      return outboxHadItems
        ? `Nothing was executed. Your outbox is unchanged. Logged as #${logId}.`
        : `Nothing was executed. Outbox is still empty. Logged as #${logId}.`
    case 'ALLOW':
      return `Action executed in the sandbox. Logged as #${logId}.`
    case 'REVIEW':
      return `Waiting for a human decision in the Review Queue. Auto-denied in 10 minutes if nobody decides. Logged as #${logId}.`
  }
}
