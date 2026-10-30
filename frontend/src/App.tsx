import { useState } from 'react'

import { AppSidebar, type PageId } from '@/components/AppSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import AttackBench from '@/pages/AttackBench'
import GateLog from '@/pages/GateLog'
import ReviewQueue from '@/pages/ReviewQueue'
import RunTask from '@/pages/RunTask'

const SCREENS: Record<PageId, () => React.JSX.Element> = {
  run: RunTask,
  log: GateLog,
  review: ReviewQueue,
  bench: AttackBench,
}

export default function App() {
  const [page, setPage] = useState<PageId>('run')
  const Screen = SCREENS[page]

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar page={page} onNavigate={setPage} />
        <SidebarInset className="bg-white">
          <main className="p-8">
            <Screen />
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  )
}
