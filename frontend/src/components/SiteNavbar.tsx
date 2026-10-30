import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BrandMark } from '@/components/BrandMark'
import { SITE_PAGES, pageOfPath } from '@/components/sitePages'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'

/** Home only: the bar is transparent over the hero. It never changes the active page. */
function useScrolledPast(px: number, enabled: boolean): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const onScroll = () => setPast(window.scrollY > px)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [px, enabled])
  return past
}

/** The active item follows the route only (no scroll-spy). */
export function SiteNavbar() {
  const { pendingCount } = useStore()
  const navigate = useNavigate()
  const page = pageOfPath(useLocation().pathname)
  const onHome = page === 'home'
  const scrolled = useScrolledPast(40, onHome)
  const overHero = onHome && !scrolled

  return (
    <header
      className={cn(
        'top-0 z-40 h-16 shrink-0 border-b transition-colors motion-reduce:transition-none',
        // On Home the bar overlaps the hero instead of pushing it down; on app pages it sits above the scroll area.
        onHome ? 'sticky -mb-16' : 'relative',
        overHero ? 'border-transparent bg-transparent' : 'bg-background/80 border-border backdrop-blur-md',
      )}
    >
      <div className="mx-auto flex h-full max-w-[75rem] items-center justify-between gap-2 overflow-hidden px-4 sm:px-8">
        <Button variant="ghost" onClick={() => navigate('/')} aria-label="Home" className="-ml-2 h-auto shrink-0 px-2 py-1.5">
          <BrandMark size="lg" wordmarkClassName="hidden sm:inline" />
        </Button>

        <nav aria-label="Pages" className="flex shrink-0 items-center gap-2">
          {SITE_PAGES.map((p) => {
            const isActive = page === p.id
            return (
              <Tooltip key={p.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    aria-label={p.label}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => navigate(p.path)}
                    className={cn(
                      'text-foreground/85 hover:text-foreground relative gap-2 px-3 text-sm',
                      isActive &&
                        'bg-nav-active text-nav-active-foreground hover:bg-nav-active hover:text-nav-active-foreground after:bg-primary after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full',
                    )}
                  >
                    <p.icon aria-hidden />
                    <span className="hidden min-[1000px]:inline">{p.label}</span>
                    {p.id === 'review-queue' && pendingCount > 0 && (
                      <Badge
                        key={pendingCount}
                        variant="secondary"
                        aria-label={`${pendingCount} pending`}
                        className="ag-pulse-once bg-review-soft text-review-ink border-review/40 h-5 min-w-5 rounded-full px-1.5 tabular-nums"
                      >
                        {pendingCount}
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="min-[1000px]:hidden">{p.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
