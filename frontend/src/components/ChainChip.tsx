import { useEffect, useState } from 'react'
import { Link, Unlink } from 'lucide-react'

import { api, USE_MOCK } from '@/api'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { verifyChain } from '@/lib/logChain'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'

/** Live: the backend recomputes the audit log's hash chain. Offline prototype: the local mock chain. */
function useChainStatus(): { ok: boolean | null; brokenAt?: number } {
  const { state } = useStore()
  const [live, setLive] = useState<{ ok: boolean | null; brokenAt?: number }>({ ok: null })
  const newestId = state.log[state.log.length - 1]?.id

  useEffect(() => {
    if (USE_MOCK) return
    let cancelled = false
    api
      .verifyLogs()
      .then((c) => !cancelled && setLive({ ok: c.ok, brokenAt: c.broken_at }))
      .catch(() => !cancelled && setLive({ ok: null }))
    return () => {
      cancelled = true
    }
  }, [newestId])

  return USE_MOCK ? { ok: verifyChain(state.log) } : live
}

export function ChainChip() {
  const { ok, brokenAt } = useChainStatus()
  const Icon = ok === false ? Unlink : Link
  const label = ok === null ? 'Checking chain…' : ok ? 'Chain verified ✓' : `Chain broken at #${brokenAt ?? '?'}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-[3px]',
            ok === null && 'text-muted-foreground',
            ok === true && 'bg-allowed-soft text-allowed-ink border-allowed/40',
            ok === false && 'bg-blocked-soft text-blocked-ink border-blocked/40',
          )}
        >
          <Icon aria-hidden className={cn('size-3.5', ok === true && 'text-allowed', ok === false && 'text-blocked')} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>Every log entry is hash-chained to the one before it. Any edit breaks the chain.</TooltipContent>
    </Tooltip>
  )
}
