import { House, Play, ScrollText, ShieldAlert, UserCheck, type LucideIcon } from 'lucide-react'

export type PageId = 'home' | 'run-task' | 'gate-log' | 'review-queue' | 'attack-bench'

/** The five pages, in navbar order. */
export const SITE_PAGES: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'run-task', label: 'Run Task', icon: Play },
  { id: 'gate-log', label: 'Gate Log', icon: ScrollText },
  { id: 'review-queue', label: 'Review Queue', icon: UserCheck },
  { id: 'attack-bench', label: 'Attack Bench', icon: ShieldAlert },
]
