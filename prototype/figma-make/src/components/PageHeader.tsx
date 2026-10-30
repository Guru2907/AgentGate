import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="relative isolate flex flex-wrap items-start justify-between gap-4">
      <div aria-hidden className="halftone-corner absolute -top-8 -right-8 -z-10 h-40 w-[28rem]" />
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="title-fade text-[2rem] leading-[1.1] font-light tracking-[-0.02em]">{title}</h2>
        <p className="text-muted-foreground font-mono text-xs tracking-[0.12em]">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  )
}
