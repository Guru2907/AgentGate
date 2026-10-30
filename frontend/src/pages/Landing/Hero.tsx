import { ArrowRight } from 'lucide-react'

import heroArt from '@/assets/agentgate-hero-art.png'
import { Button } from '@/components/ui/button'
import { scrollToSection } from '@/lib/scroll'

export function Hero() {
  return (
    <section aria-label="Introduction" className="@container relative isolate flex h-screen min-h-[44rem] flex-col overflow-hidden">
      {/* Artwork starts 8rem down (anchored bottom) so the gate crystal sits clearly below the CTA. */}
      <img
        src={heroArt}
        alt=""
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-20 h-[calc(100%-8rem)] w-full object-cover object-bottom"
      />
      {/* Slow ambient pulse on the glow behind the gate (bottom offset tracks the cover-scaled artwork). */}
      <div
        aria-hidden
        className="ag-ambient pointer-events-none absolute bottom-[max(calc((100%-8rem)*0.317),17.8cqw)] left-1/2 -z-10 size-[clamp(16rem,26cqw,26rem)] rounded-full"
      />
      {/* Top-to-transparent fade keeps the headline area clean. */}
      <div aria-hidden className="from-background via-background/80 absolute inset-x-0 top-0 -z-10 h-[55%] bg-gradient-to-b to-transparent" />

      {/* Top padding clears the sticky navbar that overlaps the hero. */}
      <div className="flex flex-col items-center px-6 pt-[calc(5.5rem+clamp(1.5rem,5vh,3.5rem))] text-center">
        <h1 className="title-fade text-[clamp(3rem,5.6cqw,5rem)] leading-[1.05] font-light tracking-[-0.03em]">
          The AI can be fooled.
          <br />
          The gate <span className="text-primary">can't.</span>
        </h1>
        <p className="text-muted-foreground mt-6 max-w-[36rem] font-mono text-sm tracking-[0.15em] text-balance">
          A security layer between AI decisions and real-world actions.
        </p>
        <Button
          variant="outline"
          size="lg"
          className="mt-8 h-12 px-7 text-base border-white/25 bg-white/12 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)] backdrop-blur-xl hover:border-white/40 hover:bg-white/18 hover:text-white"
          onClick={() => scrollToSection('how-it-works')}
        >
          See how it works
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </section>
  )
}
