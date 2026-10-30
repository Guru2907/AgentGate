import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { api, type AuthUser } from '@/api'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  passwordResetEnabled: boolean
  refresh: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const session = await api.auth.session()
      setUserState(session.user)
      setPasswordResetEnabled(session.password_reset_enabled)
      setStatus(session.user ? 'authenticated' : 'anonymous')
    } catch {
      setUserState(null)
      setPasswordResetEnabled(false)
      setStatus('anonymous')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onSessionExpired = () => {
      setUserState(null)
      setStatus('anonymous')
    }
    window.addEventListener('agentgate:session-expired', onSessionExpired)
    return () => window.removeEventListener('agentgate:session-expired', onSessionExpired)
  }, [refresh])

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next)
    setStatus(next ? 'authenticated' : 'anonymous')
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setUser(null)
    }
  }, [setUser])

  const value = useMemo(
    () => ({ status, user, passwordResetEnabled, refresh, setUser, logout }),
    [status, user, passwordResetEnabled, refresh, setUser, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
