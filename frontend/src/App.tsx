import { useCallback, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CookieConsent } from '@/components/CookieConsent'
import { ReplayModePill } from '@/components/ReplayModePill'
import { SiteNavbar } from '@/components/SiteNavbar'
import { pageOfPath, pathFromLegacyHash, pathOf, postLoginPage, PROTECTED_PAGES, type PageId } from '@/components/sitePages'
import { Account } from '@/pages/Account'
import { AttackBench } from '@/pages/AttackBench'
import { GateLog } from '@/pages/GateLog'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { ResetPassword } from '@/pages/ResetPassword'
import { ReviewQueue } from '@/pages/ReviewQueue'
import { RunTask } from '@/pages/RunTask'
import { Signup } from '@/pages/Signup'
import { AuthProvider, useAuth } from '@/state/auth'
import { StoreProvider } from '@/state/store'

/** Auth pages take a PageId navigator; this maps it onto the router. */
function usePageNavigate(): (page: PageId) => void {
  const navigate = useNavigate()
  return useCallback((page: PageId) => navigate(pathOf(page)), [navigate])
}

function LandingLayout() {
  const go = usePageNavigate()
  const { user } = useAuth()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <div className="app-atmosphere min-h-screen">
      <SiteNavbar />
      <Home
        onOpenWorkspace={() => go(user ? 'run-task' : 'signup')}
        onSignIn={() => go('login')}
        onSignUp={() => go('signup')}
      />
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

/** Frontend guard is only UX; every protected backend route checks the session too. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const { pathname } = useLocation()
  if (status === 'loading') {
    return (
      <AppLayout>
        <p className="text-muted-foreground font-mono text-sm tracking-[0.12em]">Checking session…</p>
      </AppLayout>
    )
  }
  if (!user) {
    const page = pageOfPath(pathname)
    const next = PROTECTED_PAGES.includes(page) ? `?next=${page}` : ''
    return <Navigate to={`${pathOf('login')}${next}`} replace />
  }
  return <AppLayout>{children}</AppLayout>
}

/** Sign-in pages: signed-in visitors go straight on to the app. */
function AuthLayout({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  if (status !== 'loading' && user) return <Navigate to={pathOf(postLoginPage())} replace />
  return (
    <div className="app-atmosphere min-h-screen">
      <SiteNavbar />
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[75rem] items-center px-4 py-16 sm:px-8">{children}</main>
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

function LoginRoute() {
  return <Login onNavigate={usePageNavigate()} />
}

function SignupRoute() {
  return <Signup onNavigate={usePageNavigate()} />
}

function ResetPasswordRoute() {
  return <ResetPassword onNavigate={usePageNavigate()} />
}

function AccountRoute() {
  return <Account onNavigate={usePageNavigate()} />
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
      <AuthProvider>
        <StoreProvider>
          <TooltipProvider>
            <Routes>
              <Route path="/" element={<LegacyHashRedirect />} />
              <Route path="/login" element={<AuthLayout><LoginRoute /></AuthLayout>} />
              <Route path="/signup" element={<AuthLayout><SignupRoute /></AuthLayout>} />
              <Route path="/reset-password" element={<AuthLayout><ResetPasswordRoute /></AuthLayout>} />
              <Route path="/app" element={<Navigate to={pathOf('run-task')} replace />} />
              <Route path="/app/run" element={<RequireAuth><RunTaskRoute /></RequireAuth>} />
              <Route path="/app/log" element={<RequireAuth><GateLogRoute /></RequireAuth>} />
              <Route path="/app/review" element={<RequireAuth><ReviewQueueRoute /></RequireAuth>} />
              <Route path="/app/bench" element={<RequireAuth><AttackBench /></RequireAuth>} />
              <Route path="/app/account" element={<RequireAuth><AccountRoute /></RequireAuth>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ReplayModePill />
            <CookieConsent />
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
