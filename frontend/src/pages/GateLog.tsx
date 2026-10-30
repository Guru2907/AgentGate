import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Search, SearchX, X } from 'lucide-react'

import type { LogEntry, Verdict } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BreakableText } from '@/components/BreakableText'
import { ChainChip } from '@/components/ChainChip'
import { CornerMarks } from '@/components/CornerMarks'
import { EmptyState } from '@/components/EmptyState'
import { FieldList } from '@/components/FieldList'
import { PageHeader } from '@/components/PageHeader'
import { RuleReasonList } from '@/components/RuleReason'
import { SourceBadge } from '@/components/SourceBadge'
import { ToolCallBlock } from '@/components/ToolCallBlock'
import { VerdictBadge } from '@/components/VerdictBadge'
import { docName, formatTime, ruleShortId, shortHash, taskLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'

type Filter = 'all' | Verdict

const TABS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ALLOW', label: 'Allowed' },
  { value: 'BLOCK', label: 'Blocked' },
  { value: 'REVIEW', label: 'Needs review' },
]

function rulesHit(entry: LogEntry): string {
  if (entry.rules.length === 0) return '—'
  return entry.rules.map((r) => ruleShortId(r) + (entry.verdict === 'REVIEW' ? ' (review)' : '')).join(', ')
}

function ExecutedText({ entry, resolvedBy }: { entry: LogEntry; resolvedBy?: number }) {
  if (entry.executed) return <span>Yes</span>
  if (entry.verdict !== 'REVIEW') return <span className="text-muted-foreground">No</span>
  if (resolvedBy) return <span className="text-muted-foreground">Decided in #{resolvedBy}</span>
  return <span className="text-review-ink font-medium">Waiting</span>
}

function LiveStatus({ online }: { online: boolean | null }) {
  if (online === false) {
    return (
      <span className="text-blocked-ink inline-flex items-center gap-1.5 text-xs">
        <span aria-hidden className="bg-blocked size-1.5 rounded-full" />
        Backend offline
      </span>
    )
  }
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden className="bg-allowed ag-pulse-soft size-1.5 rounded-full" />
      Live · updates every 2 s
    </span>
  )
}

/** `focusLogId` opens that entry on mount (the page remounts on every navigation). */
export function GateLog({ focusLogId = null }: { focusLogId?: number | null }) {
  const { state } = useStore()
  const [tab, setTab] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(focusLogId)
  const [sheetOpen, setSheetOpen] = useState(focusLogId !== null)
  // Rows added after mount animate in; seeded rows don't.
  const [initialMaxId] = useState(() => state.log[state.log.length - 1]?.id ?? 0)

  const newestFirst = useMemo(() => [...state.log].reverse(), [state.log])
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: state.log.length, ALLOW: 0, BLOCK: 0, REVIEW: 0 }
    for (const e of state.log) c[e.verdict]++
    return c
  }, [state.log])

  const q = query.trim().toLowerCase()
  const rows = newestFirst.filter(
    (e) =>
      (tab === 'all' || e.verdict === tab) &&
      (!q || e.doc.toLowerCase().includes(q) || e.tool.includes(q) || String(e.id) === q.replace(/^#/, '')),
  )
  const filtered = tab !== 'all' || q.length > 0

  // The newest row is highlighted until the user picks another.
  const highlightedId = selectedId ?? newestFirst[0]?.id
  const selected = state.log.find((e) => e.id === highlightedId)

  function open(entry: LogEntry) {
    setSelectedId(entry.id)
    setSheetOpen(true)
  }

  function reset() {
    setQuery('')
    setTab('all')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Gate Log"
        description="Every action the AI tried, and what the gate decided."
        actions={
          <>
            <ChainChip />
            <LiveStatus online={state.backendOnline} />
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Filter)} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="max-w-full justify-start overflow-x-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label} <span className="tabular-nums">({counts[t.value]})</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="relative w-full sm:w-72">
            <Search aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="Search by document, tool or log id"
              placeholder="Search document, tool or #id…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              className="pr-8 pl-8"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md outline-none focus-visible:ring-[3px]"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <TabsContent value={tab} className="flex flex-col gap-2">
          {rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              message={
                state.log.length === 0
                  ? 'No actions logged yet. Run a task to see the gate decide.'
                  : 'No actions match. Clear the search or switch tabs.'
              }
              action={
                filtered && (
                  <Button variant="outline" size="sm" onClick={reset}>
                    Reset filters
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="card-edge bg-card relative rounded-xl border">
                <CornerMarks marks={[{ corner: 'tl', tone: 'violet' }, { corner: 'br', tone: 'orange' }]} />
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Time</TableHead>
                      <TableHead className="hidden lg:table-cell">Task</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead className="hidden sm:table-cell">Tool</TableHead>
                      <TableHead>Verdict</TableHead>
                      <TableHead className="hidden md:table-cell">Rules hit</TableHead>
                      <TableHead className="hidden sm:table-cell">Executed</TableHead>
                      <TableHead className="hidden xl:table-cell">Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => (
                      <TableRow
                        key={e.id}
                        tabIndex={0}
                        aria-label={`Log #${e.id}, open details`}
                        data-state={e.id === highlightedId ? 'selected' : undefined}
                        onClick={() => open(e)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault()
                            open(e)
                          }
                        }}
                        className={cn(
                          'ag-select-row focus-visible:ring-ring/50 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-inset',
                          e.id > initialMaxId && 'ag-row-reveal',
                        )}
                      >
                        <TableCell className="font-mono whitespace-nowrap">
                          <span className="sm:hidden">{formatTime(e.ts).slice(0, 5)}</span>
                          <span className="hidden sm:inline">{formatTime(e.ts)}</span>
                        </TableCell>
                        <TableCell className="hidden min-w-24 lg:table-cell xl:whitespace-nowrap">{taskLabel(e.task)}</TableCell>
                        <TableCell className="min-w-32 sm:min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono [overflow-wrap:anywhere] xl:whitespace-nowrap">
                              <BreakableText text={docName(e.doc)} />
                            </span>
                            <SourceBadge source={e.source} />
                          </span>
                          {/* Phones: tool shown under the document instead of its own column. */}
                          <span className="text-muted-foreground mt-1 block font-mono text-2xs sm:hidden">{e.tool}</span>
                        </TableCell>
                        <TableCell className="hidden font-mono sm:table-cell xl:whitespace-nowrap">
                          <BreakableText text={e.tool} />
                        </TableCell>
                        <TableCell>
                          <VerdictBadge verdict={e.verdict} />
                        </TableCell>
                        <TableCell className="hidden min-w-20 font-mono md:table-cell">{rulesHit(e)}</TableCell>
                        <TableCell className="hidden min-w-16 sm:table-cell">
                          <ExecutedText entry={e} resolvedBy={state.resolutions[e.id]} />
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden font-mono whitespace-nowrap xl:table-cell">
                          {shortHash(e.hash)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-muted-foreground px-1 text-xs tabular-nums">
                Showing {rows.length} of {state.log.length} actions
                {filtered && (
                  <>
                    {' · '}
                    <button type="button" onClick={reset} className="hover:text-foreground underline-offset-4 hover:underline">
                      Reset filters
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen && !!selected} onOpenChange={setSheetOpen}>
        <SheetContent>{selected && <LogDetail entry={selected} resolvedBy={state.resolutions[selected.id]} />}</SheetContent>
      </Sheet>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast(`${label} copied.`)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to clipboard.')
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Copy ${label}`} onClick={copy} className="size-7">
          {copied ? <Check className="text-allowed size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied' : `Copy ${label}`}</TooltipContent>
    </Tooltip>
  )
}

function HashValue({ value, label }: { value?: string; label: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex items-center justify-between gap-2">
      <span className="min-w-0 break-all">{value}</span>
      <CopyButton value={value} label={label} />
    </span>
  )
}

function LogDetail({ entry, resolvedBy }: { entry: LogEntry; resolvedBy?: number }) {
  return (
    <>
      <SheetHeader>
        <span className="eyebrow">Log entry #{entry.id}</span>
        <SheetTitle className="flex items-center gap-3">
          <VerdictBadge verdict={entry.verdict} size="lg" />
        </SheetTitle>
        <SheetDescription className="font-mono text-xs">{entry.ts.replace('T', ' ')}</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-6">
        <FieldList
          fields={[
            { label: 'Task', value: taskLabel(entry.task) },
            { label: 'Document', value: entry.doc, mono: true },
            { label: 'Source', value: entry.source, mono: true },
            { label: 'Executed', value: <ExecutedText entry={entry} resolvedBy={resolvedBy} /> },
          ]}
        />
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Proposed tool call</span>
          <ToolCallBlock call={{ tool: entry.tool, args: entry.args }} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Rules hit</span>
          {entry.rules.length > 0 ? (
            <RuleReasonList rules={entry.rules} reasons={entry.reasons} verdict={entry.verdict} />
          ) : (
            <p className="py-2 text-sm">No rules hit. The call matched the task policy.</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Chain</span>
          <FieldList
            className={cn('bg-muted rounded-lg border p-3')}
            fields={[
              { label: 'hash', value: <HashValue value={entry.hash} label="hash" />, mono: true },
              { label: 'prev hash', value: <HashValue value={entry.prev_hash} label="previous hash" />, mono: true },
            ]}
          />
        </div>
      </SheetBody>
    </>
  )
}
