import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'

import { formatCountdown } from '@/lib/format'

/** Live "Auto-deny in m:ss" timer. The store performs the timeout itself. */
export function CountdownText({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return (
    <span role="timer" className="text-review-ink inline-flex items-center gap-1.5 text-sm font-medium tabular-nums">
      <Timer aria-hidden className="text-review size-4" />
      Auto-deny in <span className="font-mono">{formatCountdown(deadline - now)}</span>
    </span>
  )
}
