import { useState, type ReactNode } from 'react'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ReplayModePill } from '@/components/ReplayModePill'
import { SiteNavbar } from '@/components/SiteNavbar'
import type { PageId } from '@/components/sitePages'
import { AttackBench } from '@/pages/AttackBench'
import { GateLog } from '@/pages/GateLog'
import { Home } from '@/pages/Home'
import { ReviewQueue } from '@/pages/ReviewQueue'
import { RunTask } from '@/pages/RunTask'
import { StoreProvider } from '@/state/store'

/** Centred 1200px page container; the extra bottom padding keeps content clear of the REPLAY MODE pill. */
function AppPage({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[75rem] px-8 pt-12 pb-24">{children}</main>
}

export default function App() {
  const [page, setPage] = useState<PageId>('home')

  function navigate(next: PageId) {
    window.scrollTo(0, 0)
    setPage(next)
  }

  // Only the current page is rendered. Shared data (log, queue, outbox, Run Task session)
  // lives in the store above it, so it survives page changes.
  const pages: Record<PageId, ReactNode> = {
    home: <Home onTryDemo={() => navigate('run-task')} />,
    'run-task': (
      <AppPage>
        <RunTask onOpenReviewQueue={() => navigate('review-queue')} />
      </AppPage>
    ),
    'gate-log': (
      <AppPage>
        <GateLog />
      </AppPage>
    ),
    'review-queue': (
      <AppPage>
        <ReviewQueue />
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
