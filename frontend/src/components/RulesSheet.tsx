import { useEffect, useState } from 'react'

import type { TaskId } from '@/types'
import { api, USE_MOCK, type ApiPolicy } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { VerdictBadge } from '@/components/VerdictBadge'
import { TASK_LABELS } from '@/lib/format'
import { TASK_POLICIES, type PolicySection } from '@/mock/rules'

/** The live policy (GET /api/policy) turned into the same sections the sheet already renders. */
function policySections(policy: ApiPolicy, task: TaskId): PolicySection[] {
  const t = policy.tasks[task] ?? {}
  const g = policy.global
  const allow = t.recipients?.allow_domains ?? []
  const review = t.recipients?.review_domains ?? []
  const scope = t.files?.scope ?? []
  const patterns = Object.keys(g.sensitive_patterns ?? {}).map((p) => p.replace(/_/g, ' '))
  return [
    { rule: 'R1', label: 'Allowed tools', kind: 'chips', values: t.allowed_tools ?? [] },
    allow.length || review.length
      ? {
          rule: 'R2',
          label: 'Recipients',
          kind: 'domains',
          domains: [
            ...allow.map((domain) => ({ domain, verdict: 'ALLOW' as const })),
            ...review.map((domain) => ({ domain, verdict: 'REVIEW' as const })),
            { domain: 'any other domain', verdict: 'BLOCK' as const },
          ],
        }
      : { rule: 'R2', label: 'Recipients', kind: 'text', text: 'None allowed.' },
    scope.length
      ? { rule: 'R3', label: 'Files this task may touch', kind: 'chips', values: scope }
      : { rule: 'R3', label: 'Files this task may touch', kind: 'text', text: 'None.' },
    { rule: 'R4', label: 'Sensitive files (never attached or deleted)', kind: 'chips', values: g.sensitive_files ?? [] },
    { rule: 'R5 · R10', label: 'Private data that may not leave, even encoded', kind: 'chips', values: patterns },
    { rule: 'R8', label: 'Denied for every task', kind: 'chips', values: g.deny_tools ?? [] },
    { rule: 'R7', label: 'Action limit', kind: 'text', text: `At most ${g.max_calls_per_run ?? '—'} actions per run.` },
    {
      rule: 'R9',
      label: 'After reading sensitive data',
      kind: 'text',
      text: 'Confidential data read in a run can never be emailed out in the same run. Personal data needs a human review.',
    },
  ]
}

function SectionBody({ section }: { section: PolicySection }) {
  switch (section.kind) {
    case 'chips':
      return (
        <div className="flex flex-wrap gap-2">
          {section.values.map((v) => (
            <Badge key={v} variant="outline" className="font-mono text-xs font-normal">
              {v}
            </Badge>
          ))}
        </div>
      )
    case 'text':
      return <p className="text-sm">{section.text}</p>
    case 'domains':
      return (
        <ul className="divide-y rounded-lg border">
          {section.domains.map((d) => (
            <li key={d.domain} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="font-mono text-compact">{d.domain}</span>
              <VerdictBadge verdict={d.verdict} />
            </li>
          ))}
        </ul>
      )
  }
}

interface RulesSheetProps {
  task: TaskId
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RulesSheet({ task, open, onOpenChange }: RulesSheetProps) {
  const [policy, setPolicy] = useState<ApiPolicy | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (USE_MOCK || !open || policy) return
    api
      .policy()
      .then(setPolicy)
      .catch(() => setFailed(true))
  }, [open, policy])

  const sections = USE_MOCK ? TASK_POLICIES[task] : policy ? policySections(policy, task) : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <span className="eyebrow">Task policy</span>
          <SheetTitle>Rules for “{TASK_LABELS[task]}”</SheetTitle>
          <SheetDescription>Checked by the gate on every proposed tool call, in plain code.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {!USE_MOCK && !policy ? (
            <p className="text-muted-foreground text-sm">{failed ? 'Could not load the policy from the backend.' : 'Loading policy…'}</p>
          ) : (
            <dl className="flex flex-col gap-6">
              {sections.map((section) => (
                <div key={section.label} className="flex flex-col gap-2">
                  <dt className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{section.label}</span>
                    <span className="text-muted-foreground font-mono text-2xs">{section.rule}</span>
                  </dt>
                  <dd>
                    <SectionBody section={section} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </SheetBody>
        <SheetFooter>
          <p className="text-muted-foreground text-sm">Anything not listed is denied by default.</p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
