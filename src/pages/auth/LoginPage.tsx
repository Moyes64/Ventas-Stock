import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'

/**
 * Pantalla de inicio de sesión. Con `setup` sirve para crear el primer
 * administrador cuando no hay ningún usuario activo.
 */
export default function LoginPage({ setup = false }: { setup?: boolean }) {
  const { login, setupFirstAdmin } = useAuth()
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (setup && password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setSubmitting(true)
    try {
      const result = setup
        ? await setupFirstAdmin({ username, password, name })
        : await login(username, password)
      if (!result.success) {
        setError(result.error ?? 'No se pudo iniciar sesión')
        setPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="login-logo">💼</span>
          <span className="login-title">Ventas-Stock</span>
        </div>
        {setup && (
          <p className="login-hint">
            No hay ningún usuario activo. Creá el usuario administrador para empezar a usar el sistema.
          </p>
        )}
        <div className="form-row">
          <label className="label" htmlFor="login-username">Usuario</label>
          <input
            id="login-username" type="text" className="input input--large" autoFocus
            autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required
          />
        </div>
        {setup && (
          <div className="form-row">
            <label className="label" htmlFor="login-name">Nombre completo</label>
            <input
              id="login-name" type="text" className="input input--large"
              value={name} onChange={e => setName(e.target.value)} required
            />
          </div>
        )}
        <div className="form-row">
          <label className="label" htmlFor="login-password">Contraseña</label>
          <input
            id="login-password" type="password" className="input input--large"
            autoComplete={setup ? 'new-password' : 'current-password'}
            value={password} onChange={e => setPassword(e.target.value)} required
          />
        </div>
        {setup && (
          <div className="form-row">
            <label className="label" htmlFor="login-confirm">Confirmar contraseña</label>
            <input
              id="login-confirm" type="password" className="input input--large" autoComplete="new-password"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
            />
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
          {submitting ? 'Ingresando...' : setup ? 'Crear administrador e ingresar' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
