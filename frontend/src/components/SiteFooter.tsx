export function SiteFooter() {
  return (
    <footer className="text-muted-foreground border-t px-8 pt-8 pb-20 text-center font-mono text-xs tracking-[0.08em]">
      <p>AgentGate · Team Y2K Devs (AH53) · AfterHours 1.0 · Every tool is sandboxed: nothing is really emailed or deleted.</p>
      <button
        type="button"
        className="hover:text-foreground mt-3 underline underline-offset-4"
        onClick={() => window.dispatchEvent(new Event('agentgate:cookie-preferences'))}
      >
        Cookie preferences
      </button>
    </footer>
  )
}
