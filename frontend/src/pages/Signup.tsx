import { useState, type FormEvent } from 'react'

import { ApiError, api } from '@/api'
import { AuthFormShell } from '@/components/AuthFormShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PageId } from '@/components/sitePages'
import { useAuth } from '@/state/auth'
import { signupSchema } from '@/validation/auth'

interface SignupProps {
  onNavigate: (page: PageId) => void
}

export function Signup({ onNavigate }: SignupProps) {
  const { setUser } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const parsed = signupSchema.safeParse({
      full_name: fullName,
      email: email.trim(),
      password,
      confirm_password: confirmPassword,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the fields and try again.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api.auth.signup({
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        password: parsed.data.password,
      })
      setUser(result.user)
      onNavigate('run-task')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not create account. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthFormShell
      title="Create account"
      description="Your workspace is private — audit logs stay with you."
      submitLabel="Create account"
      submitting={submitting}
      error={error}
      onSubmit={onSubmit}
      footer={
        <p>
          Already have an account?{' '}
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => onNavigate('login')}>
            Sign in
          </Button>
        </p>
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-name">Full name</Label>
        <Input
          id="signup-name"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-password">Password</Label>
        <div className="relative">
        <Input
          id="signup-password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="pr-20"
        />
        <button type="button" className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-3 text-xs" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Hide' : 'Show'}</button>
        </div>
        <div aria-label={`Password length strength: ${password.length >= 16 ? 'strong' : password.length >= 12 ? 'good' : 'needs more characters'}`} className="flex gap-1">
          {[12, 16, 20].map((length) => <span key={length} className={`h-1 flex-1 rounded-full ${password.length >= length ? 'bg-primary' : 'bg-muted'}`} />)}
        </div>
        <p className="text-muted-foreground text-xs">At least 12 characters. Longer passphrases are stronger.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-confirm-password">Confirm password</Label>
        <Input id="signup-confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
      </div>
    </AuthFormShell>
  )
}
