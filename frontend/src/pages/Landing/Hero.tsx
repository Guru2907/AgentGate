import type { CSSProperties } from 'react'
import { ArrowDown, Play } from 'lucide-react'

import heroArt from '@/assets/agentgate-hero-art.png'
import { Button } from '@/components/ui/button'
import { scrollToSection } from '@/lib/scroll'
import { useAuth } from '@/state/auth'

// The scaled artwork must not show its rectangle: fade all four edges into the page background.
const EDGE_X = 'linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%)'
const EDGE_Y = 'linear-gradient(to bottom, transparent 0, transparent 7rem, #000 15rem, #000 82%, transparent 100%)'
const HERO_EDGE_FADE: CSSProperties = {
  maskImage: `${EDGE_X}, ${EDGE_Y}`,
  maskComposite: 'intersect',
  WebkitMaskImage: `${EDGE_X}, ${EDGE_Y}`,
  WebkitMaskComposite: 'source-in',
}

export function Hero({
  onOpenWorkspace,
  onSignIn,
  onSignUp,
}: {
  onOpenWorkspace: () => void
  onSignIn: () => void
  onSignUp: () => void
}) {
  // Signed in: just the way back into the workspace, no sign-up or sign-in prompts.
  const signedIn = useAuth().user !== null

  return (
    <section aria-label="Introduction" className="@container relative isolate flex h-screen min-h-[44rem] flex-col overflow-hidden">
      {/* Art, glow and sparks scale as one, so they stay aligned; the smaller scene leaves room for the buttons below the cube. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 origin-[50%_32%] scale-[0.8] sm:scale-[0.82]" style={HERO_EDGE_FADE}>
        {/* Artwork: slow float so the gate scene feels alive under the copy. */}
        <img
          src={heroArt}
          alt=""
          aria-hidden
          className="ag-hero-art absolute inset-x-0 bottom-0 -z-20 h-[calc(100%-8rem)] w-full object-cover object-bottom"
        />
        {/* Dual ambient rings behind the crystal (violet / orange split). */}
        <div
          aria-hidden
          className="ag-ambient pointer-events-none absolute bottom-[max(calc((100%-8rem)*0.317),17.8cqw)] left-1/2 -z-10 size-[clamp(16rem,26cqw,26rem)] rounded-full"
        />
        <div
          aria-hidden
          className="ag-ambient-outer pointer-events-none absolute bottom-[max(calc((100%-8rem)*0.28),14cqw)] left-1/2 -z-10 size-[clamp(22rem,34cqw,34rem)] rounded-full"
        />
        {/* Soft drifting sparks — brand colors only, decorative. */}
        <div aria-hidden className="ag-hero-sparks pointer-events-none absolute inset-0 -z-10">
          <span className="ag-spark ag-spark-a" />
          <span className="ag-spark ag-spark-b" />
          <span className="ag-spark ag-spark-c" />
          <span className="ag-spark ag-spark-d" />
          <span className="ag-spark ag-spark-e" />
        </div>
      </div>
      {/* Top-to-transparent fade keeps the headline area clean. */}
      <div aria-hidden className="from-background via-background/80 absolute inset-x-0 top-0 -z-10 h-[55%] bg-gradient-to-b to-transparent" />

      {/* Headline and subtitle above the cube. Top padding clears the sticky navbar that overlaps the hero. */}
      <div className="relative z-0 flex flex-col items-center px-6 pt-[calc(4.75rem+clamp(0.75rem,3vh,2.5rem))] text-center">
        <h1 className="text-[clamp(2.5rem,5.6cqw,5rem)] leading-[1.05] font-light tracking-[-0.03em]">
          <span className="ag-hero-line title-fade" style={{ '--ag-i': 0 } as CSSProperties}>
            The AI can be fooled.
          </span>
          <span className="ag-hero-line" style={{ '--ag-i': 1 } as CSSProperties}>
            <span className="title-fade">The gate </span>
            <span className="ag-hero-accent">can't.</span>
          </span>
        </h1>
        <p
          className="ag-fade-up ag-hero-sub text-muted-foreground mt-4 max-w-[36rem] font-mono text-sm tracking-[0.15em] text-balance"
          style={{ '--ag-i': 2 } as CSSProperties}
        >
          A security layer between AI decisions and real-world actions.
        </p>
      </div>

      {/* Buttons sit below the gate cube. */}
      <div className="absolute inset-x-0 bottom-[clamp(1.25rem,4.5vh,2.75rem)] z-10 flex flex-col items-center px-6 text-center">
        <div className="ag-fade-up flex flex-col items-center gap-3 sm:flex-row" style={{ '--ag-i': 4 } as CSSProperties}>
          <Button size="lg" className="ag-cta-glow h-12 px-7 text-base" onClick={onOpenWorkspace}>
            <Play aria-hidden />
            Open workspace
          </Button>
          {!signedIn && (
            <Button
              variant="outline"
              size="lg"
              className="ag-orbit-btn h-12 border-2 px-7 text-base hover:bg-transparent hover:text-white"
              onClick={onSignUp}
            >
              Create account
            </Button>
          )}
        </div>
        <p className="ag-fade-up text-muted-foreground mt-4 text-sm" style={{ '--ag-i': 5 } as CSSProperties}>
          {!signedIn && (
            <>
              Already have a workspace?{' '}
              <button type="button" className="text-foreground underline-offset-4 hover:underline" onClick={onSignIn}>
                Sign in
              </button>
              {' · '}
            </>
          )}
          <button
            type="button"
            className="text-foreground underline-offset-4 hover:underline"
            onClick={() => scrollToSection('how-it-works')}
          >
            How it works
            <ArrowDown aria-hidden className="ml-1 inline size-3.5 align-[-2px]" />
          </button>
        </p>
      </div>
    </section>
  )
}
