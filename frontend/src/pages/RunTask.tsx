import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react'
import { toast } from 'sonner'
import { FileLock, Play, RotateCcw, ScrollText, ShieldCheck, Syringe, TriangleAlert, Upload, UserCheck } from 'lucide-react'

import type { RunResult, TaskId } from '@/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { DocTypeBadge } from '@/components/DocTypeBadge'
import { CornerMarks } from '@/components/CornerMarks'
import { IdleArtwork } from '@/components/IdleArtwork'
import { EgressPreview } from '@/components/EgressPreview'
import { PageHeader } from '@/components/PageHeader'
import { PipelineStrip } from '@/components/PipelineStrip'
import { RuleReasonList } from '@/components/RuleReason'
import { RulesSheet } from '@/components/RulesSheet'
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
    if (busy) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        startRun('run')
        scrollResultIntoView(resultRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, startRun])

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.(txt|pdf)$/i.test(file.name)) {
      toast('Only .txt and .pdf documents are supported.')
      return
    }
    updateRunSession({
      documents: documents.some((d) => d.name === file.name) ? documents : [...documents, uploadedDocument(file.name)],
      selected: file.name,
    })
    toast(`${file.name} added. Treated as a clean document in replay mode.`)
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
              <RadioGroup aria-labelledby="doc-label" value={selected} onValueChange={setSelected} className="gap-2">
                {documents.map((d) => (
                  <Label
                    key={d.name}
                    htmlFor={`doc-${d.name}`}
                    className={cn(
                      'hover:bg-accent flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-normal transition-colors',
                      selected === d.name && 'border-border-strong bg-accent',
                    )}
                  >
                    <RadioGroupItem id={`doc-${d.name}`} value={d.name} />
                    <span className="min-w-0 flex-1 font-mono text-compact leading-snug break-all">{d.name}</span>
                    <DocTypeBadge type={d.type} />
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div className="flex flex-col gap-3">
              <Input ref={fileInput} type="file" accept=".txt,.pdf" className="hidden" onChange={onFileChosen} tabIndex={-1} />
              <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
                <Upload aria-hidden />
                Upload document
              </Button>
              <Button className="w-full" size="lg" onClick={() => start('run')} disabled={busy}>
                {busy ? <RotateCcw aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Play aria-hidden />}
                {busy ? 'Running…' : 'Run'}
                {!busy && <kbd className="bg-primary-foreground/15 ml-1 hidden rounded px-1.5 py-0.5 font-mono text-2xs font-medium sm:inline">Ctrl ↵</kbd>}
              </Button>
              <Button variant="link" className="h-auto self-start px-0" onClick={() => setRulesOpen(true)}>
                <FileLock aria-hidden />
                View rules for this task
              </Button>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <span className="eyebrow">Demo</span>
              <Button variant="outline" className="text-blocked-ink hover:text-blocked-ink self-start" onClick={() => start('inject')} disabled={busy}>
                <Syringe aria-hidden />
                Inject attack
              </Button>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Sends a hostile tool call straight to the gate, no AI involved.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------ Result ----------------------------- */}
        <section ref={resultRef} aria-label="Result" aria-live="polite" className="flex min-w-0 scroll-mt-20 flex-col gap-4">
          {phase.kind === 'idle' && (
            <IdleArtwork message="Choose a document and press Run to see what the AI tries to do." />
          )}

          {phase.kind === 'loading' && (
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

          {phase.kind === 'done' && <RunOutcome outcome={phase.outcome} onOpenReviewQueue={onOpenReviewQueue} onOpenLog={onOpenLog} />}
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

function RunOutcome({ outcome, onOpenReviewQueue, onOpenLog }: RunOutcomeProps) {
  const { request, result, extras, source, logId, outboxHadItems } = outcome
  const call = result.proposed[0]
  const decision = result.decisions[0]
  const output = result.outputs[0]
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

      {extras.hiddenText && (
        <Card className="ag-fade-up gap-2 py-3" style={{ '--ag-i': 1 } as CSSProperties}>
          <CardHeader className="px-4">
            <CardTitle>Hidden text found in document</CardTitle>
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
        <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 2 } as CSSProperties}>
          <CardContent className="flex flex-col gap-3 px-4">
            <Eyebrow>Proposed tool call</Eyebrow>
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
          {verdict === 'ALLOW' && (
            <div className="flex flex-col gap-2">
              <Eyebrow>Executed output</Eyebrow>
              <p className="bg-muted rounded-lg border px-4 py-3 text-sm leading-relaxed">{output}</p>
            </div>
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

function alertText(verdict: RunResult['decisions'][number]['verdict'], logId: number, outboxHadItems: boolean): string {
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
