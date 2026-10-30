import { House, KeyRound, LogIn, Play, ScrollText, ShieldAlert, User, UserCheck, UserPlus, type LucideIcon } from 'lucide-react'

export type PageId =
  | 'home'
  | 'run-task'
  | 'gate-log'
  | 'review-queue'
  | 'attack-bench'
  | 'login'
  | 'signup'
  | 'reset-password'
  | 'account'

type SitePage = { id: PageId; label: string; icon: LucideIcon; path: string }

/** The five pages, in navbar order. Home is the landing page. */
export const SITE_PAGES: SitePage[] = [
  { id: 'home', label: 'Home', icon: House, path: '/' },
  { id: 'run-task', label: 'Run Task', icon: Play, path: '/app/run' },
  { id: 'gate-log', label: 'Gate Log', icon: ScrollText, path: '/app/log' },
  { id: 'review-queue', label: 'Review Queue', icon: UserCheck, path: '/app/review' },
  { id: 'attack-bench', label: 'Attack Bench', icon: ShieldAlert, path: '/app/bench' },
]

/** Sign-in and account pages (not in the main nav row). */
export const AUTH_PAGES: SitePage[] = [
  { id: 'login', label: 'Sign in', icon: LogIn, path: '/login' },
  { id: 'signup', label: 'Sign up', icon: UserPlus, path: '/signup' },
  { id: 'reset-password', label: 'Reset password', icon: KeyRound, path: '/reset-password' },
  { id: 'account', label: 'Account', icon: User, path: '/app/account' },
]

const ALL_PAGES = [...SITE_PAGES, ...AUTH_PAGES]

export const pathOf = (id: PageId) => ALL_PAGES.find((p) => p.id === id)!.path

/** The page for a URL path; anything unknown counts as Home. */
export const pageOfPath = (path: string): PageId => ALL_PAGES.find((p) => p.path === path)?.id ?? 'home'

/** All app and account pages require a server-validated session. */
export const PROTECTED_PAGES: PageId[] = ['run-task', 'gate-log', 'review-queue', 'attack-bench', 'account']

/** Where to go after signing in: the ?next= page if it is a protected one, else Run Task. */
export function postLoginPage(): PageId {
  const next = new URLSearchParams(window.location.search).get('next')
  return next && PROTECTED_PAGES.includes(next as PageId) ? (next as PageId) : 'run-task'
}

/** Old hash links (#/run-task) from before routing, mapped to their new paths. */
export function pathFromLegacyHash(hash: string): string | null {
  const id = hash.replace(/^#\/?/, '').split('?')[0]
  return ALL_PAGES.find((p) => p.id === id && p.id !== 'home')?.path ?? null
}
