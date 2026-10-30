import { ArrowRight, Bot, FileText, Wrench, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { GateGlyph } from '@/components/GateGlyph'
import { cn } from '@/lib/utils'

const STEPS: { title: string; text: string; icon: LucideIcon | null }[] = [
  { title: 'Document', text: 'A resume or notice may hide instructions the AI reads.', icon: FileText },
  { title: 'AI agent', text: 'The AI can only propose an action. It cannot run one.', icon: Bot },
  { title: 'Gate', text: 'Plain rules decide every proposed action, every time.', icon: null },
  { title: 'Tool', text: 'Only approved actions run, in a sandbox.', icon: Wrench },
]

export function HowItWorks({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <section id="how-it-works" className="mx-auto flex max-w-6xl scroll-mt-16 flex-col items-center gap-10 px-8 py-24">
      <span className="eyebrow">How it works</span>
      <ol className="flex w-full items-stretch gap-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex min-w-0 flex-1 items-center gap-3">
            {i > 0 && <ArrowRight aria-hidden className="text-muted-foreground size-4 shrink-0" />}
            <Card className={cn('h-full flex-1 gap-3 px-5', !step.icon && 'gate-border glow-gate')}>
              {step.icon ? (
                <step.icon aria-hidden className="text-foreground size-5" />
              ) : (
                <GateGlyph compact className="glow-gate-icon size-6" />
              )}
              <span className="text-base font-medium">{step.title}</span>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.text}</p>
            </Card>
          </li>
        ))}
      </ol>
      <Button size="lg" onClick={onTryDemo}>
        Try the demo
      </Button>
    </section>
  )
}
