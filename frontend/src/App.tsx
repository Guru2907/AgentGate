import { useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ReplayModePill } from '@/components/ReplayModePill'
import { SiteNavbar } from '@/components/SiteNavbar'
import { pathFromLegacyHash, pathOf } from '@/components/sitePages'
import { AttackBench } from '@/pages/AttackBench'
import { GateLog } from '@/pages/GateLog'
import { Home } from '@/pages/Home'
import { ReviewQueue } from '@/pages/ReviewQueue'
import { RunTask } from '@/pages/RunTask'
import { StoreProvider } from '@/state/store'

function LandingLayout() {
  const navigate = useNavigate()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <div className="app-atmosphere min-h-screen">
      <SiteNavbar />
      <Home onTryDemo={() => navigate(pathOf('run-task'))} />
    </div>
  )
}

/** Fixed nav + one scroll container per page. Keying on the path remounts it, so every page starts at the top. */
function AppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div className="app-atmosphere flex h-dvh flex-col overflow-hidden">
      <SiteNavbar />
      <main key={pathname} className="ag-page-fade min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[75rem] px-4 pt-8 pb-24 sm:px-8 sm:pt-12">{children}</div>
      </main>
    </div>
  )
}

function RunTaskRoute() {
  const navigate = useNavigate()
  return (
    <RunTask
      onOpenReviewQueue={() => navigate(pathOf('review-queue'))}
      onOpenLog={(id) => navigate(pathOf('gate-log'), { state: { logId: id } })}
    />
  )
}

function GateLogRoute() {
  const { state } = useLocation()
  return <GateLog focusLogId={(state as { logId?: number } | null)?.logId ?? null} />
}

function ReviewQueueRoute() {
  const navigate = useNavigate()
  return <ReviewQueue onRunTask={() => navigate(pathOf('run-task'))} />
}

/** Old links like /#/run-task keep working. */
function LegacyHashRedirect() {
  const { hash } = useLocation()
  const target = pathFromLegacyHash(hash)
  return target ? <Navigate to={target} replace /> : <LandingLayout />
}

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <TooltipProvider>
          <Routes>
            <Route path="/" element={<LegacyHashRedirect />} />
            <Route path="/app" element={<Navigate to={pathOf('run-task')} replace />} />
            <Route path="/app/run" element={<AppLayout><RunTaskRoute /></AppLayout>} />
            <Route path="/app/log" element={<AppLayout><GateLogRoute /></AppLayout>} />
            <Route path="/app/review" element={<AppLayout><ReviewQueueRoute /></AppLayout>} />
            <Route path="/app/bench" element={<AppLayout><AttackBench /></AppLayout>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ReplayModePill />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </StoreProvider>
    </BrowserRouter>
  )
}
