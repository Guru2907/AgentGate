import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Lock, Plus, X } from 'lucide-react'

import { addAllowlistDomain, ApiError, getAllowlist, removeAllowlistDomain, type ApiAllowlist } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

function DomainChip({ domain, kind, locked, onRemove }: { domain: string; kind: 'allow' | 'review'; locked?: boolean; onRemove?: () => void }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'gap-1 font-mono',
        kind === 'allow' ? 'bg-allowed-soft text-allowed-ink border-allowed/40' : 'bg-review-soft text-review-ink border-review/40',
      )}
    >
      {locked && <Lock aria-hidden className="size-3" />}
      {domain}
      <span className="font-sans">{kind === 'allow' ? 'allowed' : 'review'}</span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${domain}`} className="hover:text-foreground ml-0.5" onClick={onRemove}>
          <X className="size-3" />
        </button>
      )}
    </Badge>
  )
}

/** Company domains Email company may send to. Built-in ones come from policy.yaml; added ones are logged. */
export function AllowlistCard() {
  const [data, setData] = useState<ApiAllowlist | null>(null)
  const [domain, setDomain] = useState('')
  const [kind, setKind] = useState<'allow' | 'review'>('allow')

  const load = useCallback(() => {
    getAllowlist()
      .then(setData)
      .catch(() => setData(null))
  }, [])
  useEffect(load, [load])

  async function add() {
    const d = domain.trim().toLowerCase()
    if (!d) return
    try {
      await addAllowlistDomain(d, kind)
      toast.success(`${d} added. The change is in the Gate Log.`)
      setDomain('')
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add the domain')
    }
  }

  async function remove(d: string) {
    try {
      await removeAllowlistDomain(d)
      toast(`${d} removed.`)
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the domain')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="allow-domain">Allowed company domains</Label>
      <div className="flex flex-wrap gap-1.5">
        {data?.builtin.allow.map((d) => <DomainChip key={d} domain={d} kind="allow" locked />)}
        {data?.builtin.review.map((d) => <DomainChip key={d} domain={d} kind="review" locked />)}
        {data?.workspace.map((w) => <DomainChip key={w.domain} domain={w.domain} kind={w.kind} onRemove={() => void remove(w.domain)} />)}
      </div>
      <div className="flex gap-2">
        <Input id="allow-domain" placeholder="newcompany.com" value={domain} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setKind(kind === 'allow' ? 'review' : 'allow')}>
          {kind === 'allow' ? 'Allow' : 'Review'}
        </Button>
        <Button size="sm" className="h-9 shrink-0" onClick={() => void add()} disabled={!domain.trim()}>
          <Plus aria-hidden />
          Add
        </Button>
      </div>
      <p className="text-muted-foreground text-2xs">Locked ones come from the policy file. Every change is written to the audit log.</p>
    </div>
  )
}
