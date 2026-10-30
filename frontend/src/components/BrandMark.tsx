import logoMark from '@/assets/agentgate-mark.png'
import { cn } from '@/lib/utils'

/** Horse mark (~36px) with AgentGate wordmark. */
export function BrandMark({
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
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 object-contain invert mix-blend-screen"
      />
      <span className={cn('text-xl leading-none font-bold tracking-tight', wordmarkClassName)}>
        Agent<span className="text-primary">Gate</span>
      </span>
    </span>
  )
}
