import { Play, ScrollText, ShieldAlert, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api, USE_MOCK } from '@/api'
import { Badge } from '@/components/ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export type PageId = 'run' | 'log' | 'review' | 'bench'

export const PAGES: { id: PageId; label: string; Icon: typeof Play }[] = [
  { id: 'run', label: 'Run Task', Icon: Play },
  { id: 'log', label: 'Gate Log', Icon: ScrollText },
  { id: 'review', label: 'Review Queue', Icon: UserCheck },
  { id: 'bench', label: 'Attack Bench', Icon: ShieldAlert },
]

function BackendStatus() {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    api.health().then(() => setOnline(true)).catch(() => setOnline(false))
  }, [])

  const dot = online === null ? 'bg-neutral-300' : online ? 'bg-green-600' : 'bg-red-600'
  const text = online === null ? 'Checking backend…' : online ? 'Backend online' : 'Backend offline'
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={`size-2 rounded-full ${dot}`} />
      {text}
    </div>
  )
}

export function AppSidebar({ page, onNavigate }: { page: PageId; onNavigate: (id: PageId) => void }) {
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        <div className="text-xl font-bold">AgentGate</div>
        <div className="text-xs text-muted-foreground">The AI can be fooled. The gate can't.</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {PAGES.map(({ id, label, Icon }) => (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton isActive={page === id} onClick={() => onNavigate(id)}>
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 px-4 py-4">
        <Badge variant="secondary" className="w-fit">{USE_MOCK ? 'MOCK DATA' : 'LIVE API'}</Badge>
        <BackendStatus />
      </SidebarFooter>
    </Sidebar>
  )
}
