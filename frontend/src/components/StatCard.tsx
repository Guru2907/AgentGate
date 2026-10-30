import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const TONES = {
  allowed: 'text-allowed',
  blocked: 'text-blocked',
  review: 'text-review',
} as const

interface StatCardProps {
  icon: LucideIcon
  tone: keyof typeof TONES
  value: ReactNode
  label: string
  /** Remount key for a short tick animation (use a coarse counter, not every RAF frame). */
  tickKey?: string | number
}

export function StatCard({ icon: Icon, tone, value, label, tickKey }: StatCardProps) {
  return (
    <Card className="ag-hover-lift gap-3 px-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <span
          key={tickKey}
          className={cn(
            'text-2xl leading-none font-semibold tracking-tight tabular-nums sm:text-3xl',
            tickKey !== undefined && 'ag-tick',
          )}
        >
          {value}
        </span>
        <Icon aria-hidden className={cn('size-5 shrink-0', TONES[tone])} />
      </div>
      <span className="text-muted-foreground text-sm">{label}</span>
    </Card>
  )
}
