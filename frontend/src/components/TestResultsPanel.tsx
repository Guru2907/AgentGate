import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ClipboardList, FileWarning, RefreshCw, ShieldCheck } from 'lucide-react'

import {
  ApiError,
  USE_MOCK,
  testsLatest,
  testsManual,
  type ApiManualTestRow,
  type ApiTestsLatest,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

const MOCK_REPORT: ApiTestsLatest = {
  generated_at: new Date().toISOString(),
  total: 257,
  passed: 250,
  failed: 0,
  xfailed: 7,
  handwritten: {
    total: 164,
    passed: 157,
    known_gaps: 7,
    by_group: {
      tools: { total: 16, passed: 16 },
      recipients: { total: 22, passed: 20 },
      files: { total: 21, passed: 21 },
      data_out: { total: 21, passed: 21 },
      encoding: { total: 21, passed: 19 },
      chains: { total: 21, passed: 21 },
      malformed: { total: 16, passed: 14 },
      clean_lookalikes: { total: 16, passed: 16 },
      review: { total: 10, passed: 10 },
    },
    gaps: [
      {
        id: 'rcp-003',
        title: 'Subdomain hr.partner-company.com',
        note: 'Gate matches domains exactly; subdomains of allowlisted domains are blocked.',
      },
    ],
  },
  by_file: { 'test_gate.py': 17 },
}

const MOCK_MANUAL: ApiManualTestRow[] = [
  {
    id: 'M01',
    area: 'Auth',
    scenario: 'Sign up new user',
    steps: 'Open /signup',
    expected: 'Lands on Run Task',
    actual: '',
    result: '',
    tester: '',
    date: '',
  },
]

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  tone: 'ok' | 'bad' | 'warn' | 'neutral'
  icon: typeof ShieldCheck
}) {
  const toneCls =
    tone === 'ok'
      ? 'text-allowed border-allowed/30'
      : tone === 'bad'
        ? 'text-blocked border-blocked/30'
        : tone === 'warn'
          ? 'text-review border-review/30'
          : 'text-foreground border-border'
  return (
    <div className={cn('flex flex-col gap-1 rounded-md border px-3 py-3', toneCls)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        <Icon aria-hidden className="size-4 shrink-0 opacity-80" />
      </div>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

function resultTone(result: string) {
  const r = result.trim().toUpperCase()
  if (r === 'PASS') return 'bg-allowed/15 text-allowed border-allowed/30'
  if (r === 'FAIL') return 'bg-blocked/15 text-blocked border-blocked/30'
  if (r === 'BLOCKED') return 'bg-review/15 text-review border-review/30'
  return 'bg-muted text-muted-foreground border-border'
}

export function TestResultsPanel() {
  const [report, setReport] = useState<ApiTestsLatest | null>(USE_MOCK ? MOCK_REPORT : null)
  const [manual, setManual] = useState<ApiManualTestRow[]>(USE_MOCK ? MOCK_MANUAL : [])
  const [area, setArea] = useState<string>('All')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!USE_MOCK)

  const load = () => {
    if (USE_MOCK) {
      setReport(MOCK_REPORT)
      setManual(MOCK_MANUAL)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    Promise.all([testsLatest(), testsManual()])
      .then(([latest, rows]) => {
        setReport(latest)
        setManual(rows)
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : 'Could not load test results'
        setError(msg)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const areas = useMemo(() => {
    const set = new Set(manual.map((r) => r.area).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [manual])

  const filtered = useMemo(
    () => (area === 'All' ? manual : manual.filter((r) => r.area === area)),
    [manual, area],
  )

  const manualPass = manual.filter((r) => r.result.trim().toUpperCase() === 'PASS').length
  const manualDone = manual.filter((r) => r.result.trim()).length
  const hw = report?.handwritten

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Test results</h2>
          <p className="text-muted-foreground text-sm">
            Hand-written gate cases, known gaps, and the manual UI matrix.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error && (
        <EmptyState message={`${error} Run python scripts/test_report.py to refresh.`} />
      )}

      {report && hw && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Hand-written cases"
              value={`${hw.passed}/${hw.total}`}
              tone="ok"
              icon={ShieldCheck}
            />
            <Stat
              label="Known gaps"
              value={String(hw.known_gaps)}
              tone="warn"
              icon={AlertTriangle}
            />
            <Stat
              label="Whole test suite"
              value={`${report.passed} passed`}
              tone="neutral"
              icon={ClipboardList}
            />
            <Stat
              label="Manual UI tests"
              value={`${manualPass}/${manual.length || 0}${manualDone ? '' : ' (open)'}`}
              tone={manualDone ? 'ok' : 'neutral'}
              icon={FileWarning}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">By group</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {Object.entries(hw.by_group).map(([group, stats]) => {
                const pct = stats.total ? Math.round((stats.passed / stats.total) * 100) : 0
                return (
                  <div key={group} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{group}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {stats.passed}/{stats.total}
                      </span>
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded">
                      <div className="bg-allowed h-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Known gaps</CardTitle>
              <p className="text-muted-foreground text-sm">
                We report these instead of hiding them. Cases stay in the suite as xfail.
              </p>
            </CardHeader>
            <CardContent>
              {hw.gaps.length === 0 ? (
                <p className="text-muted-foreground text-sm">No known gaps in the current report.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {hw.gaps.map((g) => (
                    <li key={g.id} className="rounded-md border px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{g.id}</Badge>
                        <span className="text-sm font-medium">{g.title}</span>
                      </div>
                      <p className="text-muted-foreground mt-1 text-sm">{g.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Manual UI matrix</CardTitle>
            <div className="flex flex-wrap gap-1">
              {areas.map((a) => (
                <Button
                  key={a}
                  type="button"
                  size="sm"
                  variant={area === a ? 'default' : 'outline'}
                  onClick={() => setArea(a)}
                >
                  {a}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Scenario</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.id}</TableCell>
                  <TableCell>{row.area}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.scenario}</div>
                    <div className="text-muted-foreground text-xs">{row.steps}</div>
                  </TableCell>
                  <TableCell className="max-w-xs text-sm">{row.expected}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex rounded border px-2 py-0.5 text-xs font-medium',
                        resultTone(row.result),
                      )}
                    >
                      {row.result.trim() || 'PENDING'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Run <code className="font-mono">python scripts/test_report.py</code> to refresh. CI runs the
        full suite on every push.
      </p>
    </div>
  )
}
