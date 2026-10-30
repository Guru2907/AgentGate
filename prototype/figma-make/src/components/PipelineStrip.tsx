import { Fragment } from 'react'
import { ArrowRight, Bot, FileText, Wrench, type LucideIcon } from 'lucide-react'

import type { Verdict } from '@/types'
import { BreakableText } from '@/components/BreakableText'
import { GateGlyph } from '@/components/GateGlyph'
import { VERDICT_LABELS } from '@/lib/format'
import { cn } from '@/lib/utils'

type StepState = 'lighting' | 'done' | 'skipped' | 'not-executed' | 'allow' | 'block' | 'review'

const STATE_CLASSES: Record<StepState, string> = {
  lighting: 'ag-step-lighting bg-muted text-muted-foreground',
  done: 'border-border-strong bg-card text-foreground',
  skipped: 'border-dashed bg-muted text-muted-foreground',
  'not-executed': 'border-dashed bg-muted text-muted-foreground',
  allow: 'border-allowed bg-allowed-soft text-allowed-ink',
  block: 'border-blocked bg-blocked-soft text-blocked-ink',
  review: 'border-review bg-review-soft text-review-ink',
}

const VERDICT_STATE: Record<Verdict, StepState> = { ALLOW: 'allow', BLOCK: 'block', REVIEW: 'review' }

interface PipelineStripProps {
  phase: 'loading' | 'done'
  verdict?: Verdict
  injected?: boolean
  docLabel: string
  toolLabel: string
}

/** Document → AI agent → Gate → Tool. Steps light up in order while the gate runs. */
export function PipelineStrip({ phase, verdict, injected = false, docLabel, toolLabel }: PipelineStripProps) {
  const loading = phase === 'loading' || !verdict
  const executed = verdict === 'ALLOW'

  const steps: { label: string; icon: LucideIcon | null; state: StepState; caption: string; mono?: boolean }[] = [
    {
      label: 'Document',
      icon: FileText,
      state: loading ? 'lighting' : injected ? 'skipped' : 'done',
      caption: injected ? 'skipped (injected)' : docLabel,
      mono: !injected,
    },
    {
      label: 'AI agent',
      icon: Bot,
      state: loading ? 'lighting' : injected ? 'skipped' : 'done',
      caption: injected ? 'skipped (injected)' : loading ? 'reading…' : `proposed ${toolLabel}`,
    },
    {
      label: 'Gate',
      icon: null,
      state: loading ? 'lighting' : VERDICT_STATE[verdict],
      caption: loading ? 'checking rules…' : VERDICT_LABELS[verdict],
    },
    {
      label: 'Tool',
      icon: Wrench,
      state: loading ? 'lighting' : executed ? 'allow' : 'not-executed',
      caption: loading ? 'waiting…' : executed ? 'executed (sandbox)' : 'not executed',
    },
  ]

  return (
    <ol aria-label="Pipeline" aria-busy={loading} className="flex items-stretch gap-2">
      {steps.map((step, i) => (
        <Fragment key={step.label}>
          {i > 0 && (
            <li aria-hidden className="text-muted-foreground flex items-center">
              <ArrowRight className="size-4" />
            </li>
          )}
          <li
            data-step={i}
            className={cn(
              'flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border px-4 py-2 transition-colors',
              STATE_CLASSES[step.state],
              step.label === 'Gate' && 'glow-gate',
            )}
          >
            <span className="flex items-center gap-2 text-sm leading-tight font-semibold">
              {step.icon ? (
                <step.icon aria-hidden className="size-4 shrink-0" />
              ) : (
                // Crystal gate with a split violet/orange glow, echoing the hero artwork.
                <GateGlyph compact className="glow-gate-icon -my-0.5 size-5 shrink-0" />
              )}
              {step.label}
            </span>
            <span className={cn('text-xs leading-snug [overflow-wrap:anywhere] opacity-90', step.mono && 'font-mono')}>
              <BreakableText text={step.caption} />
            </span>
          </li>
        </Fragment>
      ))}
    </ol>
  )
}
