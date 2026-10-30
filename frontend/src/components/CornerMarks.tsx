import { cn } from '@/lib/utils'

type Corner = 'tl' | 'tr' | 'bl' | 'br'

const POSITION: Record<Corner, string> = {
  tl: '-top-0.5 -left-0.5',
  tr: '-top-0.5 -right-0.5',
  bl: '-bottom-0.5 -left-0.5',
  br: '-bottom-0.5 -right-0.5',
}

/**
 * Tiny 4px violet/orange squares on card corners, echoing the pixel squares in
 * the hero artwork. Decorative only; keep to at most 6 per screen.
 */
export function CornerMarks({ marks }: { marks: { corner: Corner; tone: 'violet' | 'orange' }[] }) {
  return (
    <>
      {marks.map(({ corner, tone }) => (
        <span
          key={corner}
          aria-hidden
          className={cn(
            'pointer-events-none absolute size-1',
            POSITION[corner],
            tone === 'violet' ? 'bg-accent-violet-soft' : 'bg-primary',
          )}
        />
      ))}
    </>
  )
}
