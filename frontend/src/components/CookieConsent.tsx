import { useEffect, useState } from 'react'
import { Cookie } from 'lucide-react'

import { Button } from '@/components/ui/button'

const CONSENT_KEY = 'agentgate-cookie-preferences'
type Preferences = { essential: true; analytics: boolean }

export function CookieConsent() {
  const [preferences, setPreferences] = useState<Preferences | null>(() => {
    try { return JSON.parse(localStorage.getItem(CONSENT_KEY) ?? 'null') as Preferences | null }
    catch { return null }
  })
  const [customizing, setCustomizing] = useState(false)
  const [analytics, setAnalytics] = useState(false)

  useEffect(() => {
    const reopen = () => setPreferences(null)
    window.addEventListener('agentgate:cookie-preferences', reopen)
    return () => window.removeEventListener('agentgate:cookie-preferences', reopen)
  }, [])

  function save(analyticsEnabled: boolean) {
    const next = { essential: true as const, analytics: analyticsEnabled }
    localStorage.setItem(CONSENT_KEY, JSON.stringify(next))
    setPreferences(next)
    setCustomizing(false)
  }

  return <>
    {!preferences && <aside aria-label="Cookie preferences" className="bg-card text-card-foreground fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-xl border p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <Cookie aria-hidden className="text-primary mt-1 size-5 shrink-0" />
        <div className="flex-1">
          <h2 className="font-semibold">Your cookie choices</h2>
          <p className="text-muted-foreground mt-1 text-sm">Essential cookies keep your sign-in secure. Optional analytics cookies are off unless you allow them.</p>
          {customizing && <label className="mt-4 flex items-center gap-3 text-sm">
            <input type="checkbox" checked disabled aria-label="Essential cookies required" />
            Essential (always active)
            <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} aria-label="Allow analytics cookies" className="ml-4" />
            Optional analytics
          </label>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => save(true)}>Accept all</Button>
            <Button size="sm" variant="outline" onClick={() => save(false)}>Reject optional</Button>
            <Button size="sm" variant="ghost" onClick={() => customizing ? save(analytics) : setCustomizing(true)}>{customizing ? 'Save preferences' : 'Customize'}</Button>
          </div>
        </div>
      </div>
    </aside>}
  </>
}
