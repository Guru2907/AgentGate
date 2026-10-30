import { useEffect, useState } from 'react'
import { Link, Unlink } from 'lucide-react'

import { api } from '@/api'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'

/** Shows the result of the backend's full audit-chain verification. */
export function ChainChip() {
  const { state } = useStore()
  const [verification, setVerification] = useState<{ logId: number | null; ok: boolean | null } | null>(null)
  const latestId = state.log[0]?.id ?? null

  useEffect(() => {
    let cancelled = false
    api.verifyLogs()
      .then((result) => {
        if (!cancelled) setVerification({ logId: latestId, ok: result.ok })
      })
      .catch(() => {
        if (!cancelled) setVerification({ logId: latestId, ok: null })
      })
    return () => {
      cancelled = true
    }
  }, [latestId])

  const verified = verification?.logId === latestId ? verification.ok : null
  const Icon = verified === false ? Unlink : Link
  const label = verified === true ? 'Chain verified' : verified === false ? 'Chain broken' : 'Verification unavailable'
  const detail = verified === true
    ? 'The backend verified the complete audit chain.'
    : verified === false
      ? 'The backend detected a broken audit chain.'
      : 'The audit chain could not be verified right now.'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-[3px]',
            verified === true
              ? 'bg-allowed-soft text-allowed-ink border-allowed/40'
              : verified === false
                ? 'bg-blocked-soft text-blocked-ink border-blocked/40'
                : 'bg-muted text-muted-foreground border-border',
          )}
        >
          <Icon aria-hidden className={cn('size-3.5', verified === true ? 'text-allowed' : verified === false && 'text-blocked')} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  )
}
