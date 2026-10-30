import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  message: string
  action?: ReactNode
  className?: string
}

/** Dot-grid placeholder for idle and empty states (the only place the texture appears). */
export function EmptyState({ icon: Icon, message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'dot-grid flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-8 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="bg-card flex size-10 items-center justify-center rounded-full border">
          <Icon aria-hidden className="text-muted-foreground size-5" />
        </span>
      )}
      <p className="text-muted-foreground max-w-xs text-sm text-balance">{message}</p>
      {action}
    </div>
  )
}
