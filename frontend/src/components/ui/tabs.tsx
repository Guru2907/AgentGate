import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-4', className)} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'bg-muted/80 text-muted-foreground inline-flex h-10 w-fit items-center justify-center gap-0.5 rounded-xl border p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg border border-transparent px-3.5 py-1 text-sm font-medium whitespace-nowrap outline-none',
        'transition-[color,background-color,box-shadow,transform,border-color] duration-200 ease-out',
        'hover:bg-white/5 data-[state=active]:bg-secondary data-[state=active]:text-foreground data-[state=active]:border-border-strong/60',
        'data-[state=active]:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_4px_12px_-6px_rgba(0,0,0,0.55)]',
        'data-[state=active]:translate-y-px focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('ag-tab-in flex-1 outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
