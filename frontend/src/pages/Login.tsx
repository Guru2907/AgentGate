import { useState, type FormEvent } from 'react'

import { ApiError, api } from '@/api'
import { AuthFormShell } from '@/components/AuthFormShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/state/auth'
import type { PageId } from '@/components/sitePages'
import { postLoginPage } from '@/components/sitePages'
import { loginSchema } from '@/validation/auth'

interface LoginProps {
  onNavigate: (page: PageId) => void
}

export function Login({ onNavigate }: LoginProps) {
  const { setUser, passwordResetEnabled } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const parsed = loginSchema.safeParse({ email: email.trim(), password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the submitted fields.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api.auth.login(parsed.data)
      setUser(result.user)
      onNavigate(postLoginPage())
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not sign in. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthFormShell
      title="Sign in"
      description="Open your workspace behind the gate."
      submitLabel="Sign in"
      submitting={submitting}
      error={error}
      onSubmit={onSubmit}
      footer={
        <p>
          No account yet?{' '}
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => onNavigate('signup')}>
            Create one
          </Button>
        </p>
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="login-password">Password</Label>
          {passwordResetEnabled ? (
            <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => onNavigate('reset-password')}>
              Forgot password?
            </Button>
          ) : null}
        </div>
        <Input
          id="login-password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="button" className="text-muted-foreground hover:text-foreground self-end text-xs" onClick={() => setShowPassword((visible) => !visible)}>
          {showPassword ? 'Hide password' : 'Show password'}
        </button>
      </div>
    </AuthFormShell>
  )
}
