import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application rendering error', error.name, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return <main className="flex min-h-screen items-center justify-center px-6">
        <section role="alert" className="bg-card flex max-w-lg flex-col items-start gap-4 rounded-2xl border p-8">
          <AlertTriangle className="text-primary size-8" />
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground">The page could not be displayed. Try reloading it.</p>
          <Button onClick={() => window.location.reload()}><RotateCcw /> Reload page</Button>
        </section>
      </main>
    }
    return this.props.children
  }
}
