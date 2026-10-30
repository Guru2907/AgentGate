import type { LogSource } from '@/types'
import { Badge } from '@/components/ui/badge'

/** Small grey badge for non-standard log sources, e.g. "inject". */
export function SourceBadge({ source }: { source: LogSource }) {
  if (source === 'run') return null
  return (
    <Badge variant="secondary" className="font-mono text-2xs">
      {source}
    </Badge>
  )
}
