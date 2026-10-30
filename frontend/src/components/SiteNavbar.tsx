import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BrandMark } from '@/components/BrandMark'
import { SITE_PAGES, type PageId } from '@/components/sitePages'
import { cn } from '@/lib/utils'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { toast } from 'sonner'

function useScrolledPast(px: number): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > px)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [px])
  return past
}

interface SiteNavbarProps {
  page: PageId
  onNavigate: (page: PageId) => void
}

export function SiteNavbar({ page, onNavigate }: SiteNavbarProps) {
  const { pendingCount } = useStore()
  const { user, logout } = useAuth()
  const scrolled = useScrolledPast(40)
  // Transparent only while over the Home hero.
  const overHero = page === 'home' && !scrolled

  return (
    <header
      className={cn(
        'sticky top-0 z-40 h-16 border-b transition-colors motion-reduce:transition-none',
        // On Home the bar overlaps the hero instead of pushing it down.
        page === 'home' && '-mb-16',
        overHero ? 'border-transparent bg-transparent' : 'bg-background/80 border-border backdrop-blur-md',
      )}
    >
      <div className="mx-auto flex h-full max-w-[75rem] items-center justify-between gap-2 overflow-hidden px-4 sm:px-8">
        <Button variant="ghost" onClick={() => onNavigate('home')} aria-label="Home" className="-ml-2 h-auto shrink-0 px-2 py-1.5">
          <BrandMark size="lg" wordmarkClassName="hidden sm:inline" />
        </Button>

        <nav aria-label="Pages" className="flex shrink-0 items-center gap-2">
          {SITE_PAGES.map((p) => {
            if (p.id !== 'home' && !user) return null
            const isActive = page === p.id
            return (
              <Tooltip key={p.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    aria-label={p.label}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => onNavigate(p.id)}
                    className={cn(
                      'text-foreground/85 hover:text-foreground relative gap-2 px-3 text-sm transition-[color,background-color,box-shadow,transform] duration-200 ease-out',
                      isActive &&
                        'ag-nav-ink bg-nav-active text-nav-active-foreground hover:bg-nav-active hover:text-nav-active-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] after:bg-primary after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full',
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

          {user ? (
            <>
              <Button
                variant={page === 'account' ? 'secondary' : 'ghost'}
                className="hidden sm:inline-flex"
                onClick={() => onNavigate('account')}
              >
                {user.full_name.split(' ')[0]}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={async () => {
                  try {
                    await logout()
                    onNavigate('home')
                    toast.success('Signed out.')
                  } catch {
                    toast.error('Could not sign out. Check your connection and try again.')
                  }
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => onNavigate('login')}>
                Sign in
              </Button>
              <Button size="sm" className="hidden sm:inline-flex" onClick={() => onNavigate('signup')}>
                Sign up
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
