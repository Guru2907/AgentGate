import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { CSSProperties } from 'react'
import type { ResumeScreening as ResumeScreeningData } from '@/types'

export function ScreeningReport({ report }: { report: ResumeScreeningData }) {
  return (
    <Card className="ag-fade-up gap-3 py-4" style={{ '--ag-i': 1 } as CSSProperties}>
      <CardHeader className="gap-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-2xs font-semibold tracking-[0.16em] uppercase">Resume check</p>
            <CardTitle className="mt-1">Candidate screening</CardTitle>
          </div>
          <Badge variant="outline">{report.engine === 'ai' ? 'AI screening' : 'Offline estimate'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border bg-accent/35 p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Role fit</span>
              <span className="font-mono text-lg font-semibold">{report.fit_score}/100</span>
            </div>
            <Progress value={report.fit_score} aria-label={`Role fit ${report.fit_score} out of 100`} />
            <p className="text-muted-foreground text-xs">{report.rationale}</p>
          </div>
          <div
            className="grid size-14 place-items-center rounded-full border-2 border-primary/50 bg-primary/10 font-mono text-sm font-semibold text-primary"
            aria-hidden="true"
          >
            {report.fit_score}
          </div>
        </div>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground text-2xs font-semibold tracking-[0.14em] uppercase">Summary</h3>
          <p className="text-sm leading-relaxed">{report.summary}</p>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground text-2xs font-semibold tracking-[0.14em] uppercase">Experience</h3>
          <p className="text-sm leading-relaxed">{report.experience}</p>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground text-2xs font-semibold tracking-[0.14em] uppercase">Skills found</h3>
          {report.skills.length ? (
            <div className="flex flex-wrap gap-1.5">
              {report.skills.map((skill) => (
                <Badge key={skill} variant="secondary">{skill}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No listed skills were recognized.</p>
          )}
        </section>

        {report.hidden_findings.length > 0 && (
          <section className="flex flex-col gap-2 rounded-xl border border-blocked/30 bg-blocked/5 p-3">
            <h3 className="text-blocked-ink text-2xs font-semibold tracking-[0.14em] uppercase">
              Hidden content detected
            </h3>
            <ul className="flex flex-col gap-1.5">
              {report.hidden_findings.map((finding, index) => (
                <li key={`${index}-${finding}`} className="text-sm leading-relaxed [overflow-wrap:anywhere]">
                  {finding}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Screening is informational. Hidden instructions do not change the gate policy.
            </p>
          </section>
        )}
      </CardContent>
    </Card>
  )
}
