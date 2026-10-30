import { CircleCheck, CircleX, TriangleAlert, type LucideIcon } from 'lucide-react'

import type { Verdict } from '@/types'
import { VERDICT_LABELS } from '@/lib/format'
import { cn } from '@/lib/utils'

export const VERDICT_STYLES: Record<Verdict, { icon: LucideIcon; badge: string; ink: string; dot: string; glow: string }> = {
  ALLOW: { icon: CircleCheck, badge: 'bg-allowed-soft text-allowed-ink border-allowed/40', ink: 'text-allowed-ink', dot: 'text-allowed', glow: 'glow-allowed' },
  BLOCK: { icon: CircleX, badge: 'bg-blocked-soft text-blocked-ink border-blocked/40', ink: 'text-blocked-ink', dot: 'text-blocked', glow: 'glow-blocked' },
  REVIEW: { icon: TriangleAlert, badge: 'bg-review-soft text-review-ink border-review/40', ink: 'text-review-ink', dot: 'text-review', glow: 'glow-review' },
}

interface VerdictBadgeProps {
  verdict: Verdict
  size?: 'sm' | 'lg'
  /** Soft verdict-coloured glow, used only behind the Gate decision badge. */
  glow?: boolean
  className?: string
}

/** Verdict label + icon + colour. Colour is never the only carrier of meaning. */
export function VerdictBadge({ verdict, size = 'sm', glow = false, className }: VerdictBadgeProps) {
  const { icon: Icon, badge, dot, glow: glowClass } = VERDICT_STYLES[verdict]
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border font-semibold tracking-wide whitespace-nowrap uppercase',
        size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'gap-2 px-3 py-1 text-base',
        badge,
        glow && glowClass,
        className,
      )}
    >
      <Icon aria-hidden className={cn(size === 'sm' ? 'size-3.5' : 'size-5', dot)} />
      {VERDICT_LABELS[verdict]}
    </span>
  )
}
