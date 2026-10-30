import { House, Play, ScrollText, ShieldAlert, UserCheck, type LucideIcon } from 'lucide-react'

export type PageId = 'home' | 'run-task' | 'gate-log' | 'review-queue' | 'attack-bench'

/** The five pages, in navbar order. Home is the landing page. */
export const SITE_PAGES: { id: PageId; label: string; icon: LucideIcon; path: string }[] = [
  { id: 'home', label: 'Home', icon: House, path: '/' },
  { id: 'run-task', label: 'Run Task', icon: Play, path: '/app/run' },
  { id: 'gate-log', label: 'Gate Log', icon: ScrollText, path: '/app/log' },
  { id: 'review-queue', label: 'Review Queue', icon: UserCheck, path: '/app/review' },
  { id: 'attack-bench', label: 'Attack Bench', icon: ShieldAlert, path: '/app/bench' },
]

export const pathOf = (id: PageId) => SITE_PAGES.find((p) => p.id === id)!.path

/** The page for a URL path; anything unknown counts as Home. */
export const pageOfPath = (path: string): PageId => SITE_PAGES.find((p) => p.path === path)?.id ?? 'home'

/** Old hash links (#/run-task) from before routing, mapped to their new paths. */
export function pathFromLegacyHash(hash: string): string | null {
  const id = hash.replace(/^#\/?/, '')
  return SITE_PAGES.find((p) => p.id === id && p.id !== 'home')?.path ?? null
}
