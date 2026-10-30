import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'

import { formatCountdown } from '@/lib/format'
import { cn } from '@/lib/utils'

const URGENT_MS = 60_000

/** Live "Auto-deny in m:ss" timer. The store performs the timeout itself. */
export function CountdownText({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const remaining = deadline - now
  const urgent = remaining <= URGENT_MS
  return (
    <span
      role="timer"
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium tabular-nums transition-colors',
        urgent ? 'text-blocked-ink' : 'text-review-ink',
      )}
    >
      <Timer aria-hidden className={cn('size-4', urgent ? 'text-blocked ag-pulse-soft' : 'text-review')} />
      Auto-deny in <span className="font-mono">{formatCountdown(remaining)}</span>
    </span>
  )
}
