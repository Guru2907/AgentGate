import { useEffect, useState, type CSSProperties } from 'react'
import { toast } from 'sonner'
import { Inbox, Paperclip, RotateCcw, ScrollText, Send, ShieldX, Sparkles, TriangleAlert, UserCheck, X } from 'lucide-react'

import type { RunResult, ToolCall } from '@/types'
import { api, ApiError, checkCall, draftEmail, getAllowlist, type ApiEmailDraft, type ApiGateDecision } from '@/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RuleReasonList } from '@/components/RuleReason'
import { VerdictBadge } from '@/components/VerdictBadge'
import { docName } from '@/lib/format'
import { useStore } from '@/state/store'

const TASK = 'email_company'

interface EmailComposerProps {
  /** RunRequest.doc of the selected candidate (sample path or uploads/<id>). */
  doc: string | undefined
  onOpenReviewQueue: () => void
  onOpenLog: (logId: number) => void
}

type Sent = { result: RunResult; logId: number | null }

/** Email company as a real workflow: the AI drafts, the user edits, the gate previews, Send goes through the gate. */
export function EmailComposer({ doc, onOpenReviewQueue, onOpenLog }: EmailComposerProps) {
  const { refresh } = useStore()
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<ApiEmailDraft | null>(null)
  const [call, setCall] = useState<ToolCall | null>(null)
  const [preview, setPreview] = useState<ApiGateDecision | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)
  const [inboxUrl, setInboxUrl] = useState('http://localhost:8025')

  useEffect(() => {
    getAllowlist()
      .then((a) => setInboxUrl(a.inbox_url))
      .catch(() => {})
  }, [])

  // Live preview (debounced): the gate's verdict on the email as it is now. Nothing runs, nothing is logged.
  useEffect(() => {
    if (!call) return
    const timer = window.setTimeout(() => {
      checkCall(TASK, call)
        .then(setPreview)
        .catch(() => setPreview(null))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [call])

  async function makeDraft() {
    if (!doc || !to.trim()) return
    setDrafting(true)
    setSent(null)
    try {
      const d = await draftEmail({ doc, to: to.trim(), note: note.trim() || undefined })
      setDraft(d)
      setCall(d.calls[0] ?? null)
      setPreview(d.previews[0] ?? null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not draft the email')
    } finally {
      setDrafting(false)
    }
  }

  async function send() {
    if (!call) return
    setSending(true)
    try {
      const result = await api.inject(TASK, [call])
      const log = await refresh()
      setSent({ result, logId: log?.at(-1)?.id ?? null })
      const verdict = result.decisions[0]?.verdict
      if (verdict === 'ALLOW') toast.success('Sent. It is in the local test inbox.')
      else if (verdict === 'REVIEW') toast.warning('Held for a human in the Review Queue.')
      else toast.error('Blocked by the gate. Nothing was sent.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const args = (call?.args ?? {}) as Record<string, string | undefined>
  const setArg = (key: string, value: string | undefined) => {
    if (!call) return
    const next = { ...call.args, [key]: value }
    if (value === undefined) delete next[key]
    setCall({ ...call, args: next })
    setSent(null)
  }
  const isEmail = call?.tool === 'send_email'
  const sentVerdict = sent?.result.decisions[0]

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3 py-4">
        <CardContent className="flex flex-col gap-3 px-4">
          <span className="eyebrow">Email company · step 1: ask the AI to draft</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email-to">Company contact</Label>
              <Input id="email-to" placeholder="hr@partner-company.com" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email-note">Note (optional)</Label>
              <Input id="email-note" placeholder="For the SDE intern role" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void makeDraft()} disabled={!doc || !to.trim() || drafting}>
              {drafting ? <RotateCcw aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden />}
              {drafting ? 'Drafting…' : draft ? 'Draft again' : 'Draft email'}
            </Button>
            <span className="text-muted-foreground text-xs">
              Candidate: <span className="font-mono">{doc ? docName(doc) : 'pick a document on the left'}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {draft && call && (
        <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 1 } as CSSProperties}>
          <CardContent className="flex flex-col gap-3 px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow">Step 2: check and edit the draft</span>
              <span className="text-muted-foreground text-xs">
                {draft.agent_mode === 'live' ? 'Written by the live AI agent' : 'AI unavailable: template draft'}
              </span>
            </div>

            {draft.hidden_text && (
              <Alert variant="review">
                <TriangleAlert aria-hidden />
                <AlertDescription className="text-review-ink text-xs">
                  This document contains a hidden instruction. Check the draft carefully: <code className="[overflow-wrap:anywhere]">{draft.hidden_text.slice(0, 200)}</code>
                </AlertDescription>
              </Alert>
            )}

            {!isEmail ? (
              <Alert variant="destructive">
                <ShieldX aria-hidden />
                <AlertDescription className="text-blocked-ink">
                  The AI didn't write an email: it tried <strong>{call.tool}</strong> instead (likely fooled by the document). The gate preview
                  below shows what would happen. Draft again or write the email yourself.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="draft-to">To</Label>
                    <Input id="draft-to" className="font-mono" value={args.to ?? ''} onChange={(e) => setArg('to', e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="draft-subject">Subject</Label>
                    <Input id="draft-subject" value={args.subject ?? ''} onChange={(e) => setArg('subject', e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="draft-body">Body</Label>
                  <textarea
                    id="draft-body"
                    rows={6}
                    className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                    value={args.body ?? ''}
                    onChange={(e) => setArg('body', e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Paperclip aria-hidden className="text-muted-foreground size-4" />
                  {args.attachment ? (
                    <>
                      <span className="font-mono text-xs [overflow-wrap:anywhere]">{docName(args.attachment)}</span>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setArg('attachment', undefined)}>
                        <X aria-hidden />
                        Remove
                      </Button>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">No attachment</span>
                  )}
                </div>
              </div>
            )}

            <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Gate preview:</span>
                {preview ? <VerdictBadge verdict={preview.verdict} /> : <span className="text-muted-foreground text-xs">checking…</span>}
                <span className="text-muted-foreground text-xs">Preview only. The real decision is made and logged when you press Send.</span>
              </div>
              {preview && preview.rules.length > 0 && <RuleReasonList rules={preview.rules} reasons={preview.reasons} verdict={preview.verdict} />}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void send()} disabled={sending}>
                {sending ? <RotateCcw aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Send aria-hidden />}
                {sending ? 'Sending…' : 'Send'}
              </Button>
              <span className="text-muted-foreground text-xs">Every send goes through the gate and is written to the audit log.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {sent && sentVerdict && (
        <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 2 } as CSSProperties}>
          <CardContent className="flex flex-col gap-3 px-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="eyebrow">Step 3: result</span>
              <VerdictBadge verdict={sentVerdict.verdict} size="lg" />
            </div>
            {sentVerdict.verdict === 'ALLOW' && (
              <p className="text-allowed-ink text-sm">
                {sent.result.outputs[0]?.startsWith('Delivered')
                  ? 'Delivered to the local test inbox (nothing left this machine).'
                  : 'Recorded in the Outbox. Start Mailpit to see it arrive in a real inbox.'}
              </p>
            )}
            {sentVerdict.verdict === 'REVIEW' && <p className="text-review-ink text-sm">Held for a human. It waits in the Review Queue and is auto-denied after 10 minutes.</p>}
            {sentVerdict.verdict === 'BLOCK' && <p className="text-blocked-ink text-sm">Not sent. Edit the email and send again; every attempt is logged.</p>}
            {sentVerdict.rules.length > 0 && <RuleReasonList rules={sentVerdict.rules} reasons={sentVerdict.reasons} verdict={sentVerdict.verdict} />}
            <div className="flex flex-wrap gap-2">
              {sentVerdict.verdict === 'ALLOW' && (
                <Button size="sm" variant="outline" asChild>
                  <a href={inboxUrl} target="_blank" rel="noreferrer">
                    <Inbox aria-hidden />
                    Open inbox
                  </a>
                </Button>
              )}
              {sentVerdict.verdict === 'REVIEW' && (
                <Button size="sm" onClick={onOpenReviewQueue}>
                  <UserCheck aria-hidden />
                  Open Review Queue
                </Button>
              )}
              {sent.logId && (
                <Button size="sm" variant="outline" onClick={() => onOpenLog(sent.logId!)}>
                  <ScrollText aria-hidden />
                  Open #{sent.logId} in Gate Log
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
