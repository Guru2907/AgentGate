import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

import type { Verdict } from '@/api'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ALLOW green / BLOCK red / REVIEW amber — always with a text label (docs/DESIGN.md B5–B6).
const STYLES: Record<Verdict, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  ALLOW: { label: 'ALLOWED', className: 'bg-[#DCFCE7] text-[#166534] border-[#16A34A]', Icon: CheckCircle2 },
  BLOCK: { label: 'BLOCKED', className: 'bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]', Icon: XCircle },
  REVIEW: { label: 'NEEDS REVIEW', className: 'bg-[#FEF3C7] text-[#92400E] border-[#D97706]', Icon: AlertTriangle },
}

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const { label, className: style, Icon } = STYLES[verdict]
  return (
    <Badge variant="outline" className={cn('gap-1 font-semibold', style, className)}>
      <Icon className="size-3.5" />
      {label}
    </Badge>
  )
}
