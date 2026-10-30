import type { CSSProperties } from 'react'
import { ArrowDown, ArrowRight, Bot, FileText, Wrench, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { GateGlyph } from '@/components/GateGlyph'
import { useInView } from '@/lib/useInView'
import { cn } from '@/lib/utils'

const STEPS: { title: string; text: string; icon: LucideIcon | null }[] = [
  { title: 'Document', text: 'A resume or notice may hide instructions the AI reads.', icon: FileText },
  { title: 'AI agent', text: 'The AI can only propose an action. It cannot run one.', icon: Bot },
  { title: 'Gate', text: 'Plain rules decide every proposed action, every time.', icon: null },
  { title: 'Tool', text: 'Only approved actions run, in a sandbox.', icon: Wrench },
]

export function HowItWorks({ onTryDemo }: { onTryDemo: () => void }) {
  const [ref, inView] = useInView<HTMLElement>()

  return (
    <section
      id="how-it-works"
      ref={ref}
      data-inview={inView}
      className="mx-auto flex max-w-6xl scroll-mt-16 flex-col items-center gap-10 px-4 py-16 sm:px-8 sm:py-24"
    >
      <span className="ag-reveal eyebrow">How it works</span>
      {/* Phones: single column with down arrows. Tablets: 2x2. Desktop: one row with right arrows. */}
      <ol className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:items-stretch">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="ag-reveal flex min-w-0 flex-col items-center gap-3 lg:flex-1 lg:flex-row"
            style={{ '--ag-i': i + 1 } as CSSProperties}
          >
            {i > 0 && (
              <>
                <ArrowDown aria-hidden className="text-muted-foreground size-4 shrink-0 lg:hidden" />
                <ArrowRight aria-hidden className="text-muted-foreground hidden size-4 shrink-0 lg:block" />
              </>
            )}
            <Card
              className={cn(
                'ag-hover-lift h-full w-full flex-1 gap-3 px-5',
                !step.icon && 'gate-border glow-gate',
              )}
            >
              <span className="flex items-center gap-3">
                <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg border">
                  {step.icon ? (
                    <step.icon aria-hidden className="text-foreground size-4.5" />
                  ) : (
                    <GateGlyph compact className="glow-gate-icon size-5" />
                  )}
                </span>
                <span className="text-muted-foreground font-mono text-2xs tracking-[0.12em] uppercase">Step {i + 1}</span>
              </span>
              <span className="text-base font-medium">{step.title}</span>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.text}</p>
            </Card>
          </li>
        ))}
      </ol>
      <div className="ag-reveal flex flex-col items-center gap-3" style={{ '--ag-i': 5 } as CSSProperties}>
        <Button size="lg" onClick={onTryDemo}>
          Try the demo
          <ArrowRight aria-hidden />
        </Button>
        <p className="text-muted-foreground text-xs">Every tool is sandboxed. No real email is ever sent.</p>
      </div>
    </section>
  )
}
