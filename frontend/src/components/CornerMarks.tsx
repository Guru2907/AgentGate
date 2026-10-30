import { cn } from '@/lib/utils'

type Corner = 'tl' | 'tr' | 'bl' | 'br'

const POSITION: Record<Corner, string> = {
  tl: 'top-0 left-0',
  tr: 'top-0 right-0',
  bl: 'bottom-0 left-0',
  br: 'bottom-0 right-0',
}

/** L-bracket arms: which sides get the bevel stroke for each corner. */
const ARMS: Record<Corner, string> = {
  tl: 'border-t-2 border-l-2 rounded-tl-[3px]',
  tr: 'border-t-2 border-r-2 rounded-tr-[3px]',
  bl: 'border-b-2 border-l-2 rounded-bl-[3px]',
  br: 'border-b-2 border-r-2 rounded-br-[3px]',
}

/**
 * Bevelled L-brackets on card corners (violet / orange), echoing the hero
 * artwork. Decorative only; keep to at most 6 per screen.
 */
export function CornerMarks({ marks }: { marks: { corner: Corner; tone: 'violet' | 'orange' }[] }) {
  return (
    <>
      {marks.map(({ corner, tone }) => (
        <span
          key={corner}
          aria-hidden
          data-tone={tone}
          className={cn('ag-corner-mark pointer-events-none absolute z-10 size-3.5', POSITION[corner], ARMS[corner])}
        />
      ))}
    </>
  )
}
