import { useState } from 'react'
import { toast } from 'sonner'
import { CircleCheck, RotateCcw, ShieldCheck, ShieldX, TriangleAlert, Zap } from 'lucide-react'

import { api, type BenchResult } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CornerMarks } from '@/components/CornerMarks'
import { DocTypeBadge } from '@/components/DocTypeBadge'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { VerdictBadge } from '@/components/VerdictBadge'
import { cn } from '@/lib/utils'

export function AttackBench() {
  const [result, setResult] = useState<BenchResult | null>(null)
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)

  async function runBench() {
    setRunning(true)
    try {
      const next = await api.bench()
      setResult(next)
      setLastRun(new Date().toLocaleString())
      if (next.total === 0) {
        toast.info('No evaluation cases are configured.')
      } else {
        toast.success(`Evaluation complete: ${next.attacks_blocked} hostile actions blocked.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The evaluation could not be completed.')
    } finally {
      setRunning(false)
    }
  }

  const hostileTotal = result?.per_case.filter((item) => item.kind === 'hostile').length ?? 0
  const cleanTotal = result?.per_case.filter((item) => item.kind === 'clean').length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Policy Evaluation"
        description="Run configured security cases through the current gate policy."
        actions={
          <Button onClick={runBench} disabled={running}>
            {running ? <RotateCcw aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Zap aria-hidden />}
            {running ? 'Evaluating…' : result ? 'Run again' : 'Run evaluation'}
          </Button>
        }
      />

      <p className="text-muted-foreground text-sm">
        Synthetic policy cases are evaluated by the backend. Evaluation does not execute tools or add audit records.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:gap-6 xl:grid-cols-4">
        <StatCard
          icon={ShieldCheck}
          tone="allowed"
          value={result ? `${result.attacks_blocked} / ${hostileTotal}` : '—'}
          label="Hostile actions blocked"
        />
        <StatCard
          icon={ShieldX}
          tone="blocked"
          value={result?.attacks_passed ?? '—'}
          label="Hostile actions allowed"
        />
        <StatCard
          icon={CircleCheck}
          tone="allowed"
          value={result ? `${result.clean_allowed} / ${cleanTotal}` : '—'}
          label="Clean actions allowed"
        />
        <StatCard
          icon={TriangleAlert}
          tone="review"
          value={result?.false_alarms ?? '—'}
          label="Clean actions blocked/reviewed"
        />
      </div>

      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span aria-live="polite">{result ? `${result.total} cases evaluated` : 'No evaluation has been run yet.'}</span>
        <span>{lastRun ? `Last run ${lastRun}` : ''}</span>
      </div>

      <Card className="gap-2 pb-2">
        <CornerMarks marks={[{ corner: 'tl', tone: 'violet' }, { corner: 'br', tone: 'orange' }]} />
        <CardHeader>
          <CardTitle>Case results</CardTitle>
        </CardHeader>
        <CardContent className="px-2">
          {!result || result.per_case.length === 0 ? (
            <EmptyState
              icon={Zap}
              className="mx-3 mb-3 min-h-48"
              message={result ? 'No evaluation cases are configured.' : 'Run an evaluation to see backend policy results.'}
              action={
                !result && (
                  <Button size="sm" onClick={runBench} disabled={running}>
                    <Zap aria-hidden />
                    Run evaluation
                  </Button>
                )
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Case</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Expected</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Evaluation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.per_case.map((item) => (
                  <TableRow key={item.name} className={cn(!item.pass && 'bg-review-soft/40 hover:bg-review-soft/50')}>
                    <TableCell className="font-mono break-all">{item.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <DocTypeBadge type={item.kind} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <VerdictBadge verdict={item.expected} />
                    </TableCell>
                    <TableCell>
                      <VerdictBadge verdict={item.got} />
                    </TableCell>
                    <TableCell>
                      <span className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', item.pass ? 'text-allowed-ink' : 'text-review-ink')}>
                        {item.pass ? (
                          <CircleCheck aria-hidden className="text-allowed size-4" />
                        ) : (
                          <TriangleAlert aria-hidden className="text-review size-4" />
                        )}
                        {item.pass ? 'Pass' : 'Mismatch'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableCaption className="mb-2">Results returned by the backend policy evaluator</TableCaption>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
