import { Check, CircleCheck, X } from 'lucide-react'

import type { ReviewItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CornerMarks } from '@/components/CornerMarks'
import { CountdownText } from '@/components/CountdownText'
import { EmptyState } from '@/components/EmptyState'
import { FieldList } from '@/components/FieldList'
import { PageHeader } from '@/components/PageHeader'
import { VerdictBadge } from '@/components/VerdictBadge'
import { formatTime, taskLabel } from '@/lib/format'
import { useStore } from '@/state/store'

export function ReviewQueue() {
  const { state, pendingCount } = useStore()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Review Queue" description="Risky but valid actions wait here for a human decision." />

      <Tabs defaultValue="pending" className="gap-6">
        <TabsList>
          <TabsTrigger value="pending">
            Pending <span className="tabular-nums">({pendingCount})</span>
          </TabsTrigger>
          <TabsTrigger value="outbox">
            Outbox <span className="tabular-nums">({state.outbox.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="flex flex-col gap-4">
          {state.reviewQueue.length === 0 ? (
            <EmptyState icon={CircleCheck} message="Nothing waiting for review." />
          ) : (
            state.reviewQueue.map((item, i) => <ReviewCard key={item.id} item={item} decorated={i === 0} />)
          )}
        </TabsContent>

        <TabsContent value="outbox" className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">Mock outbox, no real email is sent.</p>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Time</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Attachment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.outbox.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.time}</TableCell>
                    <TableCell className="font-mono break-all">{o.to}</TableCell>
                    <TableCell>{o.subject}</TableCell>
                    <TableCell className="font-mono break-all">{o.attachment}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ReviewCard({ item, decorated }: { item: ReviewItem; decorated: boolean }) {
  const { resolveReview } = useStore()
  const { args } = item.call

  return (
    <Card className="gap-4 px-5">
      {decorated && <CornerMarks marks={[{ corner: 'tl', tone: 'violet' }, { corner: 'br', tone: 'orange' }]} />}
      <div className="flex flex-wrap items-center gap-3">
        <VerdictBadge verdict="REVIEW" />
        <span className="font-mono text-sm font-medium">{item.call.tool}</span>
        <span className="text-muted-foreground font-mono text-compact">{formatTime(item.ts)}</span>
        <span className="ml-auto">
          <CountdownText deadline={item.deadline} />
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <FieldList
            fields={[
              { label: 'To', value: String(args.to ?? ''), mono: true },
              { label: 'Subject', value: String(args.subject ?? '') },
              { label: 'Attachment', value: String(args.attachment ?? ''), mono: true },
              { label: 'Task', value: taskLabel(item.task) },
            ]}
          />
          <p className="text-sm">
            <span className="font-mono text-compact font-semibold break-all">{item.rule} (review):</span>{' '}
            <span className="text-foreground/80">{item.reason}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => resolveReview(item.id, 'deny')}>
            <X aria-hidden />
            Deny
          </Button>
          <Button onClick={() => resolveReview(item.id, 'approve')}>
            <Check aria-hidden />
            Approve
          </Button>
        </div>
      </div>
    </Card>
  )
}
