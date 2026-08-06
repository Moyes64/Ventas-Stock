import AsyncStorage from '@react-native-async-storage/async-storage'
import type { StockCountPairingPayload, StockCountProductForDownload } from '../types/contract'

const STORAGE_KEY = 'stock-count-session-v1'

export interface CountEntry {
  countedQuantity: number
  note: string
}

/** Estado completo de una sesión de conteo en curso, persistido tal cual en el celular. */
export interface StoredSession {
  pairing: StockCountPairingPayload
  label: string
  products: StockCountProductForDownload[]
  /** Cantidades contadas hasta ahora, indexadas por productId. */
  counts: Record<number, CountEntry>
}

export async function saveSession(session: StoredSession): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredSession
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}
