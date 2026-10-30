export function SiteFooter() {
  return (
    <footer className="text-muted-foreground border-t px-8 pt-8 pb-20 text-center font-mono text-xs tracking-[0.08em]">
      <p>AgentGate · Secure execution for AI-assisted work.</p>
      <button
        type="button"
        className="mt-3 underline underline-offset-4 hover:text-foreground"
        onClick={() => window.dispatchEvent(new Event('agentgate:cookie-preferences'))}
      >
        Cookie preferences
      </button>
    </footer>
  )
}
