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
}

export function StatCard({ icon: Icon, tone, value, label }: StatCardProps) {
  return (
    <Card className="gap-3 px-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{value}</span>
        <Icon aria-hidden className={cn('size-5 shrink-0', TONES[tone])} />
      </div>
      <span className="text-muted-foreground text-sm">{label}</span>
    </Card>
  )
}
