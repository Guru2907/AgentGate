import type { DocType } from '@/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function DocTypeBadge({ type, className }: { type: DocType; className?: string }) {
  return (
    <Badge
      variant={type === 'hostile' ? 'outline' : 'secondary'}
      className={cn('font-mono text-2xs font-medium', type === 'hostile' && 'border-blocked/60 text-blocked-ink', className)}
    >
      {type}
    </Badge>
  )
}
