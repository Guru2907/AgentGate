import type { Verdict } from '@/types'
import { VERDICT_STYLES } from '@/components/VerdictBadge'
import { cn } from '@/lib/utils'

interface RuleReasonProps {
  rule: string
  reason: string
  verdict: Verdict
}

/** One rule hit: rule ID in mono, then the plain sentence. */
export function RuleReason({ rule, reason, verdict }: RuleReasonProps) {
  const { icon: Icon, dot } = VERDICT_STYLES[verdict]
  return (
    <li className="flex items-start gap-3 py-1">
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', dot)} />
      <p className="min-w-0 text-sm leading-relaxed">
        <span className="text-foreground font-mono text-compact font-semibold break-all">
          {rule}
          {verdict === 'REVIEW' && ' (review)'}:
        </span>{' '}
        <span className="text-foreground/80">{reason}</span>
      </p>
    </li>
  )
}

export function RuleReasonList({ rules, reasons, verdict }: { rules: string[]; reasons: string[]; verdict: Verdict }) {
  return (
    <ul className="divide-y">
      {rules.map((rule, i) => (
        <RuleReason key={rule} rule={rule} reason={reasons[i]} verdict={verdict} />
      ))}
    </ul>
  )
}
