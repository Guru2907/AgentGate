import { SiteFooter } from '@/components/SiteFooter'
import { Hero } from '@/pages/Landing/Hero'
import { HowItWorks } from '@/pages/Landing/HowItWorks'

export function Home({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <>
      <Hero onTryDemo={onTryDemo} />
      <HowItWorks onTryDemo={onTryDemo} />
      <SiteFooter />
    </>
  )
}
