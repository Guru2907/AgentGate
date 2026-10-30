import { useState, type FormEvent } from 'react'

import { ApiError, api } from '@/api'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PageId } from '@/components/sitePages'
import { useAuth } from '@/state/auth'
import { changePasswordSchema, profileSchema } from '@/validation/auth'

interface AccountProps {
  onNavigate: (page: PageId) => void
}

export function Account({ onNavigate }: AccountProps) {
  const { user, setUser, logout } = useAuth()
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!user) return null

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setProfileMsg(null)
    const parsed = profileSchema.safeParse({ full_name: fullName })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your profile information.')
      return
    }
    setBusy(true)
    try {
      const updated = await api.auth.updateProfile(parsed.data)
      setUser(updated)
      setProfileMsg('Profile saved.')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not update profile.')
    } finally {
      setBusy(false)
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setPasswordMsg(null)
    const parsed = changePasswordSchema.safeParse({
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your new password.')
      return
    }
    setBusy(true)
    try {
      await api.auth.changePassword({
        current_password: parsed.data.current_password,
        new_password: parsed.data.new_password,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMsg('Password updated.')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not change password.')
    } finally {
      setBusy(false)
    }
  }

  async function removeAccount(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (deleteConfirm !== 'DELETE') {
      setError('Type DELETE to confirm account removal.')
      return
    }
    setBusy(true)
    try {
      await api.auth.deleteAccount({ password: deletePassword, confirmation: 'DELETE' })
      setUser(null)
      onNavigate('home')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not delete account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Account"
        description={user.email}
        actions={
          <Button
            variant="outline"
            onClick={async () => {
              await logout()
              onNavigate('home')
            }}
          >
            Sign out
          </Button>
        }
      />

      <section className="flex max-w-md flex-col items-start gap-2 border-b pb-6">
        <h3 className="text-lg font-medium">Cookie preferences</h3>
        <p className="text-muted-foreground text-sm">Essential security cookies are always active. Optional analytics remain disabled unless you allow them.</p>
        <Button type="button" variant="outline" onClick={() => window.dispatchEvent(new Event('agentgate:cookie-preferences'))}>
          Manage cookie preferences
        </Button>
      </section>

      {error ? (
        <p role="alert" className="text-blocked-ink bg-blocked-soft border-blocked/30 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <form onSubmit={saveProfile} className="flex max-w-md flex-col gap-3">
        <h3 className="text-lg font-medium">Profile</h3>
        <Label htmlFor="account-name">Full name</Label>
        <Input id="account-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
        {profileMsg ? <p className="text-allowed-ink text-sm">{profileMsg}</p> : null}
        <Button type="submit" disabled={busy} className="w-fit">
          Save name
        </Button>
      </form>

      <form onSubmit={savePassword} className="flex max-w-md flex-col gap-3">
        <h3 className="text-lg font-medium">Change password</h3>
        <Label htmlFor="account-current">Current password</Label>
        <Input
          id="account-current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        <Label htmlFor="account-new">New password</Label>
        <Input
          id="account-new"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={12}
        />
        <Label htmlFor="account-confirm-new">Confirm new password</Label>
        <Input id="account-confirm-new" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        {passwordMsg ? <p className="text-allowed-ink text-sm">{passwordMsg}</p> : null}
        <Button type="submit" disabled={busy} className="w-fit">
          Update password
        </Button>
      </form>

      <form onSubmit={removeAccount} className="border-blocked/30 flex max-w-md flex-col gap-3 border-t pt-8">
        <h3 className="text-blocked-ink text-lg font-medium">Delete account</h3>
        <p className="text-muted-foreground text-sm">This removes your workspace data. Type DELETE to confirm.</p>
        <Label htmlFor="account-delete-password">Password</Label>
        <Input
          id="account-delete-password"
          type="password"
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          required
        />
        <Label htmlFor="account-delete-confirm">Confirmation</Label>
        <Input
          id="account-delete-confirm"
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder="DELETE"
          required
        />
        <Button type="submit" variant="destructive" disabled={busy} className="w-fit">
          Delete account
        </Button>
      </form>
    </div>
  )
}
