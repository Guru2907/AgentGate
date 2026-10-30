import logoMark from '@/assets/agentgate-mark.png'
import { cn } from '@/lib/utils'

/** White horse mark (the original logo, inverted for dark surfaces) with the "Agent" + orange "Gate" wordmark. */
export function BrandMark({
  size = 'md',
  className,
  wordmarkClassName,
}: {
  size?: 'md' | 'lg'
  className?: string
  wordmarkClassName?: string
}) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <img
        src={logoMark}
        alt="AgentGate logo"
        className={cn('h-auto shrink-0 invert mix-blend-screen', size === 'lg' ? 'w-8' : 'w-9')}
      />
      <span className={cn('text-xl leading-none font-bold tracking-tight', wordmarkClassName)}>
        Agent<span className="text-primary">Gate</span>
      </span>
    </span>
  )
}
