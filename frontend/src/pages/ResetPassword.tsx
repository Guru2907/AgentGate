import { useMemo, useState, type FormEvent } from 'react'

import { ApiError, api } from '@/api'
import { AuthFormShell } from '@/components/AuthFormShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PageId } from '@/components/sitePages'
import { useAuth } from '@/state/auth'
import { passwordResetRequestSchema, passwordResetSchema } from '@/validation/auth'

interface ResetPasswordProps {
  onNavigate: (page: PageId) => void
}

/** The reset link is /reset-password#token=…; the fragment keeps the token out of server logs. */
function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? ''
}

export function ResetPassword({ onNavigate }: ResetPasswordProps) {
  const { passwordResetEnabled } = useAuth()
  const token = useMemo(() => tokenFromHash(), [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      if (token) {
        const parsed = passwordResetSchema.safeParse({
          new_password: password,
          confirm_password: confirmPassword,
        })
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Check your new password.')
          setSubmitting(false)
          return
        }
        await api.auth.confirmPasswordReset({ token, new_password: parsed.data.new_password })
        setMessage('Password updated. You can sign in now.')
      } else {
        const parsed = passwordResetRequestSchema.safeParse({ email: email.trim() })
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.')
          return
        }
        const result = await api.auth.requestPasswordReset(parsed.data)
        setMessage(result.message)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not reset password. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!passwordResetEnabled && !token) {
    return (
      <AuthFormShell
        title="Reset password"
        description="Email reset is not configured on this server."
        submitLabel="Back to sign in"
        onSubmit={(e) => {
          e.preventDefault()
          onNavigate('login')
        }}
        footer={
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => onNavigate('login')}>
            Sign in
          </Button>
        }
      >
        <p className="text-muted-foreground text-sm text-center">
          Ask the operator to set SMTP_HOST and SMTP_FROM, or sign in if you still know your password.
        </p>
      </AuthFormShell>
    )
  }

  return (
    <AuthFormShell
      title={token ? 'Choose a new password' : 'Reset password'}
      description={
        token
          ? 'This one-time link expires after 30 minutes.'
          : 'We will email a reset link if an account exists.'
      }
      submitLabel={token ? 'Update password' : 'Send reset link'}
      submitting={submitting}
      error={error}
      onSubmit={onSubmit}
      footer={
        <p>
          Remembered it?{' '}
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => onNavigate('login')}>
            Sign in
          </Button>
        </p>
      }
    >
      {message ? (
        <p className="text-allowed-ink bg-allowed-soft border-allowed/30 rounded-md border px-3 py-2 text-sm">{message}</p>
      ) : null}
      {token ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input id="reset-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-password-confirm">Confirm new password</Label>
            <Input id="reset-password-confirm" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      )}
    </AuthFormShell>
  )
}
