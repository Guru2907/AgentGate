import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Quiet "REPLAY MODE" pill fixed to the bottom-left corner on every page. */
export function ReplayModePill() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="focus-visible:ring-ring/50 text-muted-foreground border-border-strong bg-background/80 fixed bottom-4 left-4 z-30 inline-flex cursor-default items-center gap-2 rounded-full border px-3 py-1 font-mono text-2xs tracking-[0.12em] uppercase opacity-70 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-[3px]"
        >
          <span aria-hidden className="bg-accent-violet-soft size-1.5 rounded-full" />
          Replay mode
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">Showing recorded sample data</TooltipContent>
    </Tooltip>
  )
}
