import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { CookieConsent } from '@/components/CookieConsent'
import { SiteNavbar } from '@/components/SiteNavbar'
import { isKnownPage, postLoginPage, PROTECTED_PAGES, type PageId } from '@/components/sitePages'
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

function AppPage({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[75rem] px-4 pt-8 pb-24 sm:px-8 sm:pt-12">{children}</main>
}

function AuthPage({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[75rem] items-center px-4 py-16 sm:px-8">{children}</main>
}

// Hash routing keeps application routes available on static hosting and reset tokens out of server logs.
function pageFromHash(): PageId {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const id = raw.split('?')[0] || 'home'
  return isKnownPage(id) ? id : 'not-found'
}

function AppShell() {
  const { status, user } = useAuth()
  const [page, setPage] = useState<PageId>(pageFromHash)
  // Log entry to open when landing on Gate Log from a run result.
  const [focusLogId, setFocusLogId] = useState<number | null>(null)

  const navigate = useCallback((next: PageId, opts?: { logId?: number; redirectTo?: PageId }) => {
    setFocusLogId(opts?.logId ?? null)
    window.scrollTo(0, 0)
    setPage(next)
    const query = opts?.redirectTo ? `?next=${encodeURIComponent(opts.redirectTo)}` : ''
    const hash = next === 'home' ? '' : `#/${next}${query}`
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash || window.location.pathname)
    }
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

  // Frontend routing is only a UX guard; every protected backend route checks the session too.
  useEffect(() => {
    if (status === 'loading') return
    if (PROTECTED_PAGES.includes(page) && !user) {
      navigate('login', { redirectTo: page })
    }
    if ((page === 'login' || page === 'signup' || page === 'reset-password') && user) {
      navigate(postLoginPage())
    }
  }, [page, user, status, navigate])

  const pages: Record<PageId, ReactNode> = {
    home: (
      <Home
        onOpenWorkspace={() => navigate(user ? 'run-task' : 'signup')}
        onSignIn={() => navigate('login')}
        onSignUp={() => navigate('signup')}
      />
    ),
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
    login: (
      <AuthPage>
        <Login onNavigate={navigate} />
      </AuthPage>
    ),
    signup: (
      <AuthPage>
        <Signup onNavigate={navigate} />
      </AuthPage>
    ),
    'reset-password': (
      <AuthPage>
        <ResetPassword onNavigate={navigate} />
      </AuthPage>
    ),
    account: (
      <AppPage>
        <Account onNavigate={navigate} />
      </AppPage>
    ),
    'not-found': (
      <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="font-mono text-primary text-sm tracking-[0.2em]">404 · ROUTE NOT FOUND</span>
        <h1 className="text-4xl font-light tracking-tight">This page does not exist.</h1>
        <p className="text-muted-foreground max-w-md">The address may have changed. Return home or open your workspace.</p>
        <Button onClick={() => navigate('home')}>Back to home</Button>
      </main>
    ),
  }

  return (
    <div className="app-atmosphere min-h-screen">
      <SiteNavbar page={page} onNavigate={navigate} />
      <div key={page} className="ag-page-fade">
        {status === 'loading' && PROTECTED_PAGES.includes(page) ? (
          <AppPage>
            <p className="text-muted-foreground font-mono text-sm tracking-[0.12em]">Checking session…</p>
          </AppPage>
        ) : (
          pages[page]
        )}
      </div>
      <CookieConsent />
      <Toaster position="bottom-right" />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <TooltipProvider>
          <AppShell />
        </TooltipProvider>
      </StoreProvider>
    </AuthProvider>
  )
}
