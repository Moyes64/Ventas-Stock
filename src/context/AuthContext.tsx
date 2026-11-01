import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { auth as authApi } from '../lib/ipc'
import type { AuthenticatedUser, LoginResult } from '../types/ipc'

interface AuthContextValue {
  /** Usuario con sesión iniciada (null si nadie inició sesión). */
  user: AuthenticatedUser | null
  login: (username: string, password: string) => Promise<LoginResult>
  setupFirstAdmin: (data: { username: string; password: string; name: string }) => Promise<LoginResult>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

type Status = 'loading' | 'setup' | 'login' | 'ready'

/**
 * Pide iniciar sesión antes de mostrar la app. La sesión vive en el proceso
 * principal: al recargar la ventana se recupera sin volver a pedir la clave.
 * Si no hay ningún usuario activo, `renderSetup` permite crear el primer administrador.
 */
export function AuthProvider({
  children,
  renderLogin,
  renderSetup,
}: {
  children: ReactNode
  renderLogin: () => ReactNode
  renderSetup: () => ReactNode
}) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    void (async () => {
      const current = await authApi.currentUser()
      if (current) {
        setUser(current)
        setStatus('ready')
        return
      }
      setStatus((await authApi.needsSetup()) ? 'setup' : 'login')
    })()
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const result = await authApi.login(username, password)
    if (result.success && result.user) {
      setUser(result.user)
      setStatus('ready')
    }
    return result
  }, [])

  const setupFirstAdmin = useCallback(async (data: { username: string; password: string; name: string }) => {
    const result = await authApi.setupFirstAdmin(data)
    if (result.success && result.user) {
      setUser(result.user)
      setStatus('ready')
    }
    return result
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    // El próximo usuario arranca en Inicio, no en la pantalla donde quedó el anterior.
    window.location.hash = '#/dashboard'
    setUser(null)
    setStatus('login')
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, setupFirstAdmin, logout }}>
      {status === 'loading' ? null : status === 'setup' ? renderSetup() : status === 'login' ? renderLogin() : children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
