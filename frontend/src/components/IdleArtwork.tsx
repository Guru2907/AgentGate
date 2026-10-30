/** Run Task empty state: faint dot-grid (no hero image). */
export function IdleArtwork({ message }: { message: string }) {
  return (
    <div className="dot-grid card-edge relative isolate flex min-h-96 items-center justify-center overflow-hidden rounded-xl border transition-[box-shadow,transform] duration-200">
      <p className="text-foreground/90 max-w-xs px-6 text-center text-sm text-balance">{message}</p>
    </div>
  )
}
