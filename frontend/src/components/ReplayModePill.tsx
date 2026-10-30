import { USE_MOCK } from '@/api'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStore } from '@/state/store'

/** Status pill: mock/replay vs live API, plus offline when the backend is down. */
export function ReplayModePill() {
  const { state } = useStore()
  const offline = state.backendOnline === false

  const label = offline ? 'Backend offline' : USE_MOCK ? 'Replay mode' : 'Live API'
  const tip = offline
    ? 'Cannot reach the backend on port 8000'
    : USE_MOCK
      ? 'Showing recorded sample data'
      : 'Talking to the real backend'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="focus-visible:ring-ring/50 text-muted-foreground border-border-strong bg-background/80 fixed bottom-4 left-4 z-30 inline-flex cursor-default items-center gap-2 rounded-full border px-3 py-1 font-mono text-2xs tracking-[0.12em] uppercase opacity-70 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-[3px]"
        >
          <span
            aria-hidden
            className={
              offline ? 'bg-blocked size-1.5 rounded-full' : USE_MOCK ? 'bg-accent-violet-soft size-1.5 rounded-full' : 'bg-allowed size-1.5 rounded-full'
            }
          />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{tip}</TooltipContent>
    </Tooltip>
  )
}
