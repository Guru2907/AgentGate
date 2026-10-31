import { SiteFooter } from '@/components/SiteFooter'
import { Hero } from '@/pages/Landing/Hero'
import { HowItWorks } from '@/pages/Landing/HowItWorks'

export function Home({
  onOpenWorkspace,
  onSignIn,
  onSignUp,
}: {
  onOpenWorkspace: () => void
  onSignIn: () => void
  onSignUp: () => void
}) {
  return (
    <>
      <Hero onOpenWorkspace={onOpenWorkspace} onSignIn={onSignIn} onSignUp={onSignUp} />
      <HowItWorks onOpenWorkspace={onOpenWorkspace} />
      <SiteFooter />
    </>
  )
}
