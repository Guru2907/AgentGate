import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ReplayModePill } from '@/components/ReplayModePill'
import { SiteNavbar } from '@/components/SiteNavbar'
import { SITE_PAGES, type PageId } from '@/components/sitePages'
import { AttackBench } from '@/pages/AttackBench'
import { GateLog } from '@/pages/GateLog'
import { Home } from '@/pages/Home'
import { ReviewQueue } from '@/pages/ReviewQueue'
import { RunTask } from '@/pages/RunTask'
import { StoreProvider } from '@/state/store'

function AppPage({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[75rem] px-4 pt-8 pb-24 sm:px-8 sm:pt-12">{children}</main>
}

// Hash routing (#/run-task) keeps the page across refresh and makes demo links shareable.
function pageFromHash(): PageId {
  const id = window.location.hash.replace(/^#\/?/, '')
  return SITE_PAGES.some((p) => p.id === id) ? (id as PageId) : 'home'
}

export default function App() {
  const [page, setPage] = useState<PageId>(pageFromHash)
  // Log entry to open when landing on Gate Log from a run result.
  const [focusLogId, setFocusLogId] = useState<number | null>(null)

  const navigate = useCallback((next: PageId, opts?: { logId?: number }) => {
    setFocusLogId(opts?.logId ?? null)
    window.scrollTo(0, 0)
    setPage(next)
    const hash = next === 'home' ? '' : `#/${next}`
    if (window.location.hash !== hash) window.history.pushState(null, '', hash || window.location.pathname)
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      setFocusLogId(null)
      setPage(pageFromHash())
    }
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('popstate', onHashChange)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('popstate', onHashChange)
    }
  }, [])

  const pages: Record<PageId, ReactNode> = {
    home: <Home onTryDemo={() => navigate('run-task')} />,
    'run-task': (
      <AppPage>
        <RunTask onOpenReviewQueue={() => navigate('review-queue')} onOpenLog={(id) => navigate('gate-log', { logId: id })} />
      </AppPage>
    ),
    'gate-log': (
      <AppPage>
        <GateLog focusLogId={focusLogId} />
      </AppPage>
    ),
    'review-queue': (
      <AppPage>
        <ReviewQueue onRunTask={() => navigate('run-task')} />
      </AppPage>
    ),
    'attack-bench': (
      <AppPage>
        <AttackBench />
      </AppPage>
    ),
  }

  return (
    <StoreProvider>
      <TooltipProvider>
        <div className="app-atmosphere min-h-screen">
          <SiteNavbar page={page} onNavigate={navigate} />
          <div key={page} className="ag-page-fade">
            {pages[page]}
          </div>
        </div>
        <ReplayModePill />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </StoreProvider>
  )
}
