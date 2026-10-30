import type { TaskId } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { VerdictBadge } from '@/components/VerdictBadge'
import { TASK_LABELS } from '@/lib/format'
import { TASK_POLICIES, type PolicySection } from '@/policy/rules'

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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <span className="eyebrow">Task policy</span>
          <SheetTitle>Rules for “{TASK_LABELS[task]}”</SheetTitle>
          <SheetDescription>Checked by the gate on every proposed tool call, in plain code.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <dl className="flex flex-col gap-6">
            {TASK_POLICIES[task].map((section) => (
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
        </SheetBody>
        <SheetFooter>
          <p className="text-muted-foreground text-sm">Anything not listed is denied by default.</p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
