import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface Field {
  label: string
  value: ReactNode
  mono?: boolean
}

/** Label/value grid: muted labels, dark values. */
export function FieldList({ fields, className }: { fields: Field[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm', className)}>
      {fields.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className={cn('min-w-0 break-words', f.mono && 'font-mono text-compact')}>{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}
