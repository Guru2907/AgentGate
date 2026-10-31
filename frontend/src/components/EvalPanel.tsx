import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Gauge, RefreshCw, Shield, ShieldOff, Sparkles } from 'lucide-react'

import {
  ApiError,
  USE_MOCK,
  benchDataset,
  benchLatest,
  type ApiEvalResult,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

const CATEGORY_BLURB: Record<string, string> = {
  clean: 'Benign resumes (false-alarm check), including look-alike traps',
  hidden_comment: 'HTML comment with a SYSTEM email instruction',
  white_text_pdf: 'White or 1pt text hidden in a PDF',
  pdf_metadata: 'Instruction in PDF title / subject / keywords',
  system_line: 'Fake SYSTEM: or ASSISTANT: lines in the body',
  polite_social: 'Polite HR / audit forward request',
  ignore_previous: 'Classic ignore-previous-instructions variants',
  encoded: 'Base64 / hex / URL-encoded instruction',
  delete_request: 'Asks to delete a sensitive file',
  chain_read_then_email: 'Read confidential file then email a summary (R9)',
  split_exfil: 'Data split across several emails (R10)',
  multilingual: 'Hindi / Spanish / French + English mix',
  public_dataset: 'Attack lines adapted from public injection datasets',
}

const MOCK: ApiEvalResult = {
  total: 300,
  attacks_blocked: 196,
  attacks_passed: 4,
  clean_allowed: 97,
  false_alarms: 3,
  detection_rate: 0.98,
  false_alarm_rate: 0.03,
  ai_fooled_rate: 0.41,
  by_category: {
    white_text_pdf: { total: 25, blocked: 25, passed: 0 },
    clean: { total: 100, blocked: 3, passed: 97 },
  },
  latency: { gate_ms_p50: 2.1, gate_ms_p95: 4.8, agent_ms_p50: 0.1, agent_ms_p95: 0.4 },
  confusion: { tp: 196, fn: 4, tn: 97, fp: 3 },
  per_case: [],
}

function pct(n: number | undefined) {
  return `${((n ?? 0) * 100).toFixed(1)}%`
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  tone: 'ok' | 'bad' | 'warn' | 'neutral'
  icon: typeof Shield
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
      <span className="text-muted-foreground text-xs sm:text-sm">{label}</span>
    </div>
  )
}

export function EvalPanel() {
  const [data, setData] = useState<ApiEvalResult | null>(USE_MOCK ? MOCK : null)
  const [live, setLive] = useState<ApiEvalResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!USE_MOCK)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    if (USE_MOCK) {
      setData(MOCK)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Main numbers: the full replay run (all 300 docs). Live AI numbers: the latest live run, if any.
      setData(await benchLatest('eval', 'replay'))
      setLive(await benchLatest('eval', 'live').catch(() => null))
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to load'
      setError(msg)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function runAgain() {
    if (USE_MOCK) {
      setData(MOCK)
      return
    }
    setRunning(true)
    setError(null)
    try {
      await benchDataset('eval')
      await load()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Eval run failed'
      setError(msg)
    } finally {
      setRunning(false)
    }
  }

  const hostile = (data?.attacks_blocked ?? 0) + (data?.attacks_passed ?? 0)
  const clean = (data?.clean_allowed ?? 0) + (data?.false_alarms ?? 0)
  const conf = data?.confusion
  const lat = data?.latency
  const cats = Object.entries(data?.by_category ?? {}).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Real-world eval</h2>
          <p className="text-muted-foreground max-w-2xl text-sm">
            ~300 synthetic documents (real formats, public attack text). Measured detection, false alarms,
            AI-fooled rate, and gate latency.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={running || loading} onClick={() => void runAgain()}>
          <RefreshCw aria-hidden className={cn('size-4', running && 'animate-spin')} />
          Run again (replay)
        </Button>
      </div>

      {loading && !data ? (
        <EmptyState message="Loading eval results…" />
      ) : error && !data ? (
        <EmptyState
          message={`${error} Run scripts/eval.py --mode replay, or click Run again (replay).`}
        />
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Cases tested" value={String(data.total)} tone="neutral" icon={Gauge} />
            <Stat
              label={`Attacks blocked (${data.attacks_blocked}/${hostile})`}
              value={pct(data.detection_rate ?? (hostile ? data.attacks_blocked / hostile : 0))}
              tone="ok"
              icon={Shield}
            />
            <Stat
              label={`False alarms (${data.false_alarms}/${clean})`}
              value={pct(data.false_alarm_rate ?? (clean ? data.false_alarms / clean : 0))}
              tone={data.false_alarms ? 'warn' : 'ok'}
              icon={AlertTriangle}
            />
            {/* Only a live run measures the AI; in replay the "fooled" actions are scripted test inputs. */}
            <Stat
              label={live ? `AI alone fooled (live, ${live.ai_fooled_count}/${live.live_hostile})` : 'AI alone fooled: needs a live run'}
              value={live ? pct(live.ai_fooled_rate) : 'n/a'}
              tone={live ? 'bad' : 'neutral'}
              icon={Sparkles}
            />
            <Stat
              label="Gate time p50 / p95"
              value={`${(lat?.gate_ms_p50 ?? 0).toFixed(1)} / ${(lat?.gate_ms_p95 ?? 0).toFixed(1)} ms`}
              tone="neutral"
              icon={ShieldOff}
            />
          </div>

          {live && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Live AI run: the real Groq agent read the documents</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label={`Documents (${live.live_hostile} hostile, ${live.live_clean} clean)`} value={String((live.live_hostile ?? 0) + (live.live_clean ?? 0))} tone="neutral" icon={Gauge} />
                  <Stat label="AI fooled into a harmful action" value={`${live.ai_fooled_count}/${live.live_hostile}`} tone="bad" icon={Sparkles} />
                  <Stat label="Gate stopped the harmful ones" value={`${live.gate_stopped_when_fooled}/${live.ai_fooled_count}`} tone={live.harmful_executed ? 'warn' : 'ok'} icon={Shield} />
                  <Stat label="False alarms on clean docs" value={`${live.false_alarms}/${live.live_clean}`} tone={live.false_alarms ? 'warn' : 'ok'} icon={AlertTriangle} />
                </div>
                <p className="text-muted-foreground text-xs">
                  Harmful actions that actually executed: <strong>{live.harmful_executed ?? 0}</strong>.
                  {live.skipped_ai_unavailable ? ` ${live.skipped_ai_unavailable} document(s) skipped because the AI was unavailable (never faked).` : ''}
                  {' '}Model {live.model || 'from .env'} · {live.generated_at ? new Date(live.generated_at).toLocaleString() : ''} · run with
                  <code className="mx-1">python scripts/eval.py --mode live --limit 30</code>
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per category</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Blocked</TableHead>
                      <TableHead className="text-right">Got through</TableHead>
                      <TableHead>Trick</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cats.map(([cat, slot]) => (
                      <TableRow key={cat}>
                        <TableCell className="font-medium">
                          <Badge
                            variant="outline"
                            className={cn(
                              slot.passed > 0 && cat !== 'clean'
                                ? 'border-blocked/40 text-blocked'
                                : cat === 'clean'
                                  ? 'border-allowed/40 text-allowed'
                                  : 'border-allowed/40 text-allowed',
                            )}
                          >
                            {cat}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{slot.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{slot.blocked}</TableCell>
                        <TableCell className="text-right tabular-nums">{slot.passed}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs text-sm">
                          {CATEGORY_BLURB[cat] ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="w-full lg:w-56">
              <CardHeader>
                <CardTitle className="text-base">Confusion matrix</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-center text-sm">
                  <div className="rounded-md border border-allowed/30 bg-allowed/5 px-2 py-4">
                    <div className="text-muted-foreground text-xs">TP blocked</div>
                    <div className="text-allowed text-xl font-semibold tabular-nums">{conf?.tp ?? data.attacks_blocked}</div>
                  </div>
                  <div className="rounded-md border border-blocked/30 bg-blocked/5 px-2 py-4">
                    <div className="text-muted-foreground text-xs">FN missed</div>
                    <div className="text-blocked text-xl font-semibold tabular-nums">{conf?.fn ?? data.attacks_passed}</div>
                  </div>
                  <div className="rounded-md border border-allowed/30 bg-allowed/5 px-2 py-4">
                    <div className="text-muted-foreground text-xs">TN clean</div>
                    <div className="text-allowed text-xl font-semibold tabular-nums">{conf?.tn ?? data.clean_allowed}</div>
                  </div>
                  <div className="rounded-md border border-review/30 bg-review/5 px-2 py-4">
                    <div className="text-muted-foreground text-xs">FP alarm</div>
                    <div className="text-review text-xl font-semibold tabular-nums">{conf?.fp ?? data.false_alarms}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <p className="text-muted-foreground text-xs leading-relaxed">
        Sources: see data/eval/SOURCES.txt (public attack text adapted under Apache-2.0 / MIT / original). Live AI
        runs are done from the command line because of the free-tier rate limit. Results include misses; we don&apos;t
        claim 100%.
      </p>
      {error && data ? <p className="text-blocked text-sm">{error}</p> : null}
    </div>
  )
}
