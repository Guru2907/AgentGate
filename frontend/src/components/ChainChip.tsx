import { Link, Unlink } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { verifyChain } from '@/lib/logChain'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'

/** Recomputes the mock hash chain on every log change. */
export function ChainChip() {
  const { state } = useStore()
  const ok = verifyChain(state.log)
  const Icon = ok ? Link : Unlink
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-[3px]',
            ok ? 'bg-allowed-soft text-allowed-ink border-allowed/40' : 'bg-blocked-soft text-blocked-ink border-blocked/40',
          )}
        >
          <Icon aria-hidden className={cn('size-3.5', ok ? 'text-allowed' : 'text-blocked')} />
          {ok ? 'Chain verified ✓' : 'Chain broken'}
        </span>
      </TooltipTrigger>
      <TooltipContent>Log is hash-chained. Any edit breaks it.</TooltipContent>
    </Tooltip>
  )
}
