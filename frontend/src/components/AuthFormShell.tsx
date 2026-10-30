import type { FormEvent, ReactNode } from 'react'

import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AuthFormShellProps {
  title: string
  description: string
  children: ReactNode
  error?: string | null
  submitLabel: string
  submitting?: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  footer?: ReactNode
  className?: string
}

export function AuthFormShell({
  title,
  description,
  children,
  error,
  submitLabel,
  submitting,
  onSubmit,
  footer,
  className,
}: AuthFormShellProps) {
  return (
    <div className={cn('mx-auto flex w-full max-w-md flex-col gap-8', className)}>
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandMark size="lg" />
        <div className="flex flex-col gap-2">
          <h1 className="title-fade text-3xl font-light tracking-[-0.02em]">{title}</h1>
          <p className="text-muted-foreground font-mono text-xs tracking-[0.12em] text-balance">{description}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {children}
        {error ? (
          <p role="alert" className="text-blocked-ink bg-blocked-soft border-blocked/30 rounded-md border px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="mt-2 h-11 w-full" disabled={submitting}>
          {submitting ? 'Working…' : submitLabel}
        </Button>
      </form>

      {footer ? <div className="text-muted-foreground text-center text-sm">{footer}</div> : null}
    </div>
  )
}
