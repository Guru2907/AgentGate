import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, CircleCheck, Compass, Inbox, Play, X } from 'lucide-react'

import type { ReviewItem } from '@/types'
import { REVIEW_QUEUE_TOUR, useTour } from '@/components/OnboardingTour'
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
import { prefersReducedMotion } from '@/lib/usePrefersReducedMotion'
import { cn } from '@/lib/utils'
import { useStore, type ReviewOutcome } from '@/state/store'

const LEAVE_MS = 200

export function ReviewQueue({ onRunTask }: { onRunTask?: () => void }) {
  const { state, pendingCount, resolveReview } = useStore()
  const startTour = useTour('review-queue', REVIEW_QUEUE_TOUR)
  // Items animating out after a decision; buttons are disabled while leaving.
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  function decide(id: string, outcome: ReviewOutcome) {
    if (leaving.has(id)) return
    if (prefersReducedMotion()) {
      resolveReview(id, outcome)
      return
    }
    setLeaving((prev) => new Set(prev).add(id))
    timers.current.push(
      window.setTimeout(() => {
        resolveReview(id, outcome)
        setLeaving((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, LEAVE_MS),
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Review Queue"
        description="Risky but valid actions wait here for a human decision."
        actions={
          <Button variant="outline" size="sm" onClick={startTour}>
            <Compass aria-hidden />
            Take the tour
          </Button>
        }
      />

      <Tabs defaultValue="pending" className="gap-6">
        <TabsList>
          <TabsTrigger value="pending" data-tour="tab-pending">
            Pending <span className="tabular-nums">({pendingCount})</span>
          </TabsTrigger>
          <TabsTrigger value="outbox" data-tour="tab-outbox">
            Outbox <span className="tabular-nums">({state.outbox.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="flex flex-col gap-4">
          {state.reviewQueue.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              message="Nothing waiting for review. Run the Email company task on a resume to see one arrive."
              action={
                onRunTask && (
                  <Button variant="outline" size="sm" onClick={onRunTask}>
                    <Play aria-hidden />
                    Go to Run Task
                  </Button>
                )
              }
            />
          ) : (
            state.reviewQueue.map((item, i) => (
              <ReviewCard
                key={item.id}
                item={item}
                index={i}
                decorated={i === 0}
                leaving={leaving.has(item.id)}
                onDecide={(outcome) => decide(item.id, outcome)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="outbox" className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">Sent through the sandboxed mail tool. Nothing leaves this server.</p>
          {state.outbox.length === 0 ? (
            <EmptyState icon={Inbox} message="Outbox is empty. Approved emails show up here." />
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Time</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="hidden sm:table-cell">Subject</TableHead>
                    <TableHead>Attachment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.outbox.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono whitespace-nowrap">{o.time}</TableCell>
                      <TableCell className="font-mono break-all">{o.to}</TableCell>
                      <TableCell className="hidden sm:table-cell">{o.subject}</TableCell>
                      <TableCell className="font-mono break-all">{o.attachment}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface ReviewCardProps {
  item: ReviewItem
  index: number
  decorated: boolean
  leaving: boolean
  onDecide: (outcome: ReviewOutcome) => void
}

function ReviewCard({ item, index, decorated, leaving, onDecide }: ReviewCardProps) {
  const { args } = item.call

  return (
    <Card
      className={cn('ag-fade-up gap-4 px-5 transition-[border-color]', leaving && 'ag-collapse')}
      style={{ '--ag-i': Math.min(index, 4) } as CSSProperties}
      aria-busy={leaving}
    >
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
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none" disabled={leaving} onClick={() => onDecide('deny')}>
            <X aria-hidden />
            Deny
          </Button>
          <Button className="flex-1 sm:flex-none" disabled={leaving} onClick={() => onDecide('approve')}>
            <Check aria-hidden />
            Approve
          </Button>
        </div>
      </div>
    </Card>
  )
}
