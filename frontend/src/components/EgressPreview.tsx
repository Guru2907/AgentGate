import type { ReactNode } from 'react'
import { Mail, Paperclip, ScanSearch, type LucideIcon } from 'lucide-react'

import type { EgressInfo } from '@/types'
import { docName } from '@/lib/format'

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2">
      <Icon aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <dt className="text-muted-foreground w-20 shrink-0 text-sm">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-compact [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** What would leave the sandbox if this send_email ran. */
export function EgressPreview({ egress }: { egress: EgressInfo }) {
  const attachment = egress.attachment
  return (
    <dl className="divide-y">
      <Row icon={Mail} label="To">
        {egress.recipient ?? 'none'}
      </Row>
      <Row icon={Paperclip} label="Attachment">
        {attachment ? (
          <span title={attachment}>{docName(attachment)}</span>
        ) : (
          'none'
        )}
      </Row>
      <Row icon={ScanSearch} label="Detected">
        <span className="font-sans text-sm">{egress.detected.length ? egress.detected.join(', ') : 'nothing sensitive'}</span>
      </Row>
    </dl>
  )
}
