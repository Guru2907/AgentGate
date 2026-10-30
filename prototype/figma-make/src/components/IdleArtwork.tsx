import heroArt from '@/assets/agentgate-hero-art.png'

/** Run Task idle state: the hero artwork, centred on the gate, with the prompt overlaid at the bottom. */
export function IdleArtwork({ message }: { message: string }) {
  return (
    <div className="bg-card card-edge relative isolate flex min-h-96 items-end justify-center overflow-hidden rounded-xl border">
      <img
        src={heroArt}
        alt=""
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[calc(100%-4rem)] w-full object-cover object-[50%_62%] [mask-image:radial-gradient(ellipse_70%_75%_at_50%_45%,black_40%,transparent_100%)]"
      />
      {/* Dark scrim keeps the overlaid text at full contrast over the artwork. */}
      <div aria-hidden className="from-scrim via-scrim/90 absolute inset-x-0 bottom-0 -z-10 h-2/5 bg-gradient-to-t to-transparent" />
      <p className="text-foreground/90 max-w-xs px-6 pb-6 text-center text-sm text-balance">{message}</p>
    </div>
  )
}
