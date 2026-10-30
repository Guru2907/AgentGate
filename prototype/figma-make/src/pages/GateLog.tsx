import { useMemo, useState } from 'react'
import { SearchX } from 'lucide-react'

import type { LogEntry, Verdict } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

export function GateLog() {
  const { state } = useStore()
  const [tab, setTab] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const newestFirst = useMemo(() => [...state.log].reverse(), [state.log])
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: state.log.length, ALLOW: 0, BLOCK: 0, REVIEW: 0 }
    for (const e of state.log) c[e.verdict]++
    return c
  }, [state.log])

  const q = query.trim().toLowerCase()
  const rows = newestFirst.filter(
    (e) => (tab === 'all' || e.verdict === tab) && (!q || e.doc.toLowerCase().includes(q) || e.tool.includes(q)),
  )

  // The newest row is highlighted until the user picks another.
  const highlightedId = selectedId ?? newestFirst[0]?.id
  const selected = state.log.find((e) => e.id === highlightedId)

  function open(entry: LogEntry) {
    setSelectedId(entry.id)
    setSheetOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Gate Log"
        description="Every action the AI tried, and what the gate decided."
        actions={
          <>
            <ChainChip />
            <span className="text-muted-foreground text-xs">Live · updates every 2 s</span>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Filter)} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label} <span className="tabular-nums">({counts[t.value]})</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <Input
            aria-label="Search by document or tool"
            placeholder="Search by document or tool…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-72"
          />
        </div>

        <TabsContent value={tab}>
          {rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              message="No actions match. Clear the search or switch tabs."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery('')
                    setTab('all')
                  }}
                >
                  Reset filters
                </Button>
              }
            />
          ) : (
            <div className="relative rounded-xl border">
              <CornerMarks marks={[{ corner: 'tl', tone: 'violet' }, { corner: 'br', tone: 'orange' }]} />
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Time</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Tool</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead>Rules hit</TableHead>
                    <TableHead>Executed</TableHead>
                    <TableHead>Hash</TableHead>
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
                      className="focus-visible:ring-ring/50 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
                    >
                      <TableCell className="font-mono whitespace-nowrap">{formatTime(e.ts)}</TableCell>
                      <TableCell className="min-w-24 xl:whitespace-nowrap">{taskLabel(e.task)}</TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono [overflow-wrap:anywhere] xl:whitespace-nowrap">
                            <BreakableText text={docName(e.doc)} />
                          </span>
                          <SourceBadge source={e.source} />
                        </span>
                      </TableCell>
                      <TableCell className="font-mono xl:whitespace-nowrap">
                        <BreakableText text={e.tool} />
                      </TableCell>
                      <TableCell>
                        <VerdictBadge verdict={e.verdict} />
                      </TableCell>
                      <TableCell className="min-w-20 font-mono">{rulesHit(e)}</TableCell>
                      <TableCell className="min-w-16">
                        <ExecutedText entry={e} resolvedBy={state.resolutions[e.id]} />
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono whitespace-nowrap">{shortHash(e.hash)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen && !!selected} onOpenChange={setSheetOpen}>
        <SheetContent>{selected && <LogDetail entry={selected} resolvedBy={state.resolutions[selected.id]} />}</SheetContent>
      </Sheet>
    </div>
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
              { label: 'hash', value: entry.hash, mono: true },
              { label: 'prev hash', value: entry.prev_hash, mono: true },
            ]}
          />
        </div>
      </SheetBody>
    </>
  )
}
