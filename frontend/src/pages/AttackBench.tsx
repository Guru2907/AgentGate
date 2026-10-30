import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CircleCheck, RotateCcw, ShieldCheck, ShieldX, TriangleAlert, Zap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CornerMarks } from '@/components/CornerMarks'
import { DocTypeBadge } from '@/components/DocTypeBadge'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { VerdictBadge } from '@/components/VerdictBadge'
import { formatClock } from '@/lib/format'
import { prefersReducedMotion } from '@/lib/usePrefersReducedMotion'
import { cn } from '@/lib/utils'
import { BENCH_CASES, BENCH_SUMMARY } from '@/mock/benchCases'

const RUN_MS = 3000

export function AttackBench() {
  const { totalCases } = BENCH_SUMMARY
  // 0..1 share of the bench completed; drives progress, row reveal and count-up together.
  const [fraction, setFraction] = useState(0)
  const [running, setRunning] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)
  const frame = useRef<number | undefined>(undefined)

  useEffect(() => () => cancelAnimationFrame(frame.current ?? 0), [])

  function finish() {
    setFraction(1)
    setRunning(false)
    setHasRun(true)
    setLastRun(formatClock())
    const { attacksBlocked, attacksTotal, falseAlarms } = BENCH_SUMMARY
    toast.success(`Bench complete. ${attacksBlocked}/${attacksTotal} attacks blocked.`, {
      description: falseAlarms > 0 ? `${falseAlarms} false alarm${falseAlarms > 1 ? 's' : ''} on clean documents.` : 'No false alarms.',
    })
  }

  function runBench() {
    setRunning(true)
    if (prefersReducedMotion()) {
      finish()
      return
    }
    setFraction(0)
    const start = performance.now()
    const tick = (now: number) => {
      const f = Math.min(1, (now - start) / RUN_MS)
      setFraction(f)
      if (f < 1) frame.current = requestAnimationFrame(tick)
      else finish()
    }
    frame.current = requestAnimationFrame(tick)
  }

  const casesRun = Math.round(fraction * totalCases)
  const revealed = Math.floor(fraction * BENCH_CASES.length + 1e-9)
  const started = running || hasRun
  const count = (n: number) => (started ? Math.round(n * fraction) : '—')
  const ratio = (n: number, total: number) => (started ? `${Math.round(n * fraction)} / ${total}` : `— / ${total}`)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attack Bench"
        description="Run clean and hostile documents through the gate and score it."
        actions={
          <Button onClick={runBench} disabled={running}>
            {running ? <RotateCcw aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Zap aria-hidden />}
            {running ? 'Running…' : hasRun ? 'Run again' : 'Run bench'}
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <div className={cn('grid grid-cols-2 gap-3 transition-opacity sm:gap-6 xl:grid-cols-4', !started && 'opacity-60')}>
          <StatCard icon={ShieldCheck} tone="allowed" value={ratio(BENCH_SUMMARY.attacksBlocked, BENCH_SUMMARY.attacksTotal)} label="Attacks blocked" />
          <StatCard icon={ShieldX} tone="blocked" value={count(BENCH_SUMMARY.attacksPassed)} label="Attacks passed" />
          <StatCard icon={CircleCheck} tone="allowed" value={ratio(BENCH_SUMMARY.cleanAllowed, BENCH_SUMMARY.cleanTotal)} label="Clean allowed" />
          <StatCard icon={TriangleAlert} tone="review" value={count(BENCH_SUMMARY.falseAlarms)} label="False alarms" />
        </div>
        <p className="text-muted-foreground text-xs">
          {hasRun ? 'Sample numbers from the recorded bench run.' : 'Run the bench to score the gate against every sample document.'}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Progress value={fraction * 100} aria-label="Bench progress" />
        <div className="flex items-center justify-between text-sm">
          <span className="tabular-nums" aria-live="polite">
            {casesRun} / {totalCases} cases run
          </span>
          <span className="text-muted-foreground">
            Last run <span className="font-mono">{lastRun ?? '—'}</span>
          </span>
        </div>
      </div>

      <Card className="gap-2 pb-2">
        <CornerMarks marks={[{ corner: 'tl', tone: 'violet' }, { corner: 'br', tone: 'orange' }]} />
        <CardHeader>
          <CardTitle>Per-case results</CardTitle>
        </CardHeader>
        <CardContent className="px-2">
          {!started ? (
            <EmptyState
              icon={Zap}
              className="mx-3 mb-3 min-h-48"
              message="No results yet. Run the bench to see how each document was judged."
              action={
                <Button size="sm" onClick={runBench}>
                  <Zap aria-hidden />
                  Run bench
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Document</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Expected</TableHead>
                  <TableHead>Got</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BENCH_CASES.map((c, i) => {
                  const pass = c.expected === c.got
                  const shown = i < revealed
                  return (
                    <TableRow
                      key={c.doc}
                      aria-hidden={!shown}
                      className={cn(shown ? running && 'ag-row-reveal' : 'invisible', shown && !pass && 'bg-review-soft/40 hover:bg-review-soft/50')}
                    >
                      <TableCell className="font-mono break-all">{c.doc}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <DocTypeBadge type={c.type} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <VerdictBadge verdict={c.expected} />
                      </TableCell>
                      <TableCell>
                        <VerdictBadge verdict={c.got} />
                      </TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', pass ? 'text-allowed-ink' : 'text-review-ink')}>
                          {pass ? (
                            <CircleCheck aria-hidden className="text-allowed size-4" />
                          ) : (
                            <TriangleAlert aria-hidden className="text-review size-4" />
                          )}
                          {pass ? 'Pass' : 'False alarm'}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableCaption className="mb-2">
                Showing {BENCH_CASES.length} of {totalCases} cases
              </TableCaption>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
