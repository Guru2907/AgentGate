import { cn } from '@/lib/utils'

/**
 * Decorative gate glyph: two angular hexagonal shards (violet left, orange
 * right) with a thin white spark between them, echoing the hero artwork.
 * `compact` drops the inner facets and thickens strokes so it reads at icon size.
 */
export function GateGlyph({ className, compact = false }: { className?: string; compact?: boolean }) {
  const outer = compact ? 7 : 1.25
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={cn('size-28', className)} fill="none">
      {/* Left shard */}
      <path
        d="M42 14 L22 24 L14 40 L14 64 L24 78 L42 86 Z"
        className={cn('stroke-accent-violet-soft', compact ? 'fill-accent-violet/45' : 'fill-accent-violet/15')}
        strokeWidth={outer}
        strokeLinejoin="round"
      />
      {!compact && (
        <path d="M36 28 L26 33 L22 42 L22 60 L28 68 L36 72 Z" className="stroke-accent-violet" strokeWidth="1" strokeLinejoin="round" />
      )}
      {/* Right shard */}
      <path
        d="M54 14 L74 24 L82 40 L82 64 L72 78 L54 86 Z"
        className={cn('stroke-primary', compact ? 'fill-primary/45' : 'fill-primary/15')}
        strokeWidth={outer}
        strokeLinejoin="round"
      />
      {!compact && (
        <path d="M60 28 L70 33 L74 42 L74 60 L68 68 L60 72 Z" className="stroke-primary/70" strokeWidth="1" strokeLinejoin="round" />
      )}
      {/* Spark */}
      <path
        d={compact ? 'M48 22 L51 45 L70 48 L51 51 L48 74 L45 51 L26 48 L45 45 Z' : 'M48 30 L49 47 L60 48 L49 49 L48 66 L47 49 L36 48 L47 47 Z'}
        className="fill-foreground"
      />
    </svg>
  )
}
