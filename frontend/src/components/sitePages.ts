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
  | 'not-found'

/** Primary app pages shown in the main navbar. */
export const SITE_PAGES: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'run-task', label: 'Run Task', icon: Play },
  { id: 'gate-log', label: 'Gate Log', icon: ScrollText },
  { id: 'review-queue', label: 'Review Queue', icon: UserCheck },
  { id: 'attack-bench', label: 'Policy Evaluation', icon: ShieldAlert },
]

export const AUTH_PAGES: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'login', label: 'Sign in', icon: LogIn },
  { id: 'signup', label: 'Sign up', icon: UserPlus },
  { id: 'reset-password', label: 'Reset password', icon: KeyRound },
  { id: 'account', label: 'Account', icon: User },
]

const ALL_PAGES = [...SITE_PAGES, ...AUTH_PAGES, { id: 'not-found' as const }]

export function isKnownPage(id: string): id is PageId {
  return ALL_PAGES.some((p) => p.id === id)
}

/** All dashboard and account surfaces require a server-validated session. */
export const PROTECTED_PAGES: PageId[] = ['run-task', 'gate-log', 'review-queue', 'attack-bench', 'account']

export function postLoginPage(): PageId {
  const next = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('next')
  return next && PROTECTED_PAGES.includes(next as PageId) ? next as PageId : 'run-task'
}
