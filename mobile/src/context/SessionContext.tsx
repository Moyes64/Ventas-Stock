import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import * as storage from '../lib/storage'
import type { CountEntry, StoredSession } from '../lib/storage'
import type { StockCountPairingPayload, StockCountProductForDownload } from '../types/contract'

interface SessionContextValue {
  /** true mientras se lee la sesión persistida al arrancar la app. */
  loading: boolean
  session: StoredSession | null
  startSession: (
    pairing: StockCountPairingPayload,
    label: string,
    products: StockCountProductForDownload[]
  ) => Promise<void>
  setCount: (productId: number, entry: CountEntry) => Promise<void>
  clearCount: (productId: number) => Promise<void>
  /** Borra la sesión local (cancelación o subida exitosa). */
  endSession: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void storage.loadSession().then(s => {
      setSession(s)
      setLoading(false)
    })
  }, [])

  const startSession = useCallback(
    async (pairing: StockCountPairingPayload, label: string, products: StockCountProductForDownload[]) => {
      const next: StoredSession = { pairing, label, products, counts: {} }
      await storage.saveSession(next)
      setSession(next)
    },
    []
  )

  const setCount = useCallback(async (productId: number, entry: CountEntry) => {
    setSession(prev => {
      if (!prev) return prev
      const next: StoredSession = { ...prev, counts: { ...prev.counts, [productId]: entry } }
      void storage.saveSession(next)
      return next
    })
  }, [])

  const clearCount = useCallback(async (productId: number) => {
    setSession(prev => {
      if (!prev) return prev
      const nextCounts = { ...prev.counts }
      delete nextCounts[productId]
      const next: StoredSession = { ...prev, counts: nextCounts }
      void storage.saveSession(next)
      return next
    })
  }, [])

  const endSession = useCallback(async () => {
    await storage.clearSession()
    setSession(null)
  }, [])

  return (
    <SessionContext.Provider value={{ loading, session, startSession, setCount, clearCount, endSession }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>')
  return ctx
}
