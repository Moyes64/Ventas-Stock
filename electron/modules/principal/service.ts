import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Database } from 'better-sqlite3'
import { localNow } from '../../lib/date'
import type { PrincipalStatus } from './types'

const KEY_ID = 'principal_machine_id'
const KEY_NAME = 'principal_machine_name'
const KEY_SINCE = 'principal_since'

/** Con la base en Turso varias PCs la comparten; con el archivo local hay una sola. */
export function usesSharedDb(): boolean {
  return !!process.env.TURSO_DATABASE_URL
}

/**
 * PC principal: la única que sincroniza con la web, arranca los servidores
 * locales y factura con AFIP (sus certificados viven en esa PC). Se elige a
 * mano desde Parámetros del sistema y queda guardada en la base compartida.
 * Con la base local de siempre, esta PC es la principal.
 */
export class PrincipalService {
  private cachedMachineId: string | null = null

  constructor(private readonly db: Database) {}

  /** Identificador estable de esta PC, guardado junto a la base local. */
  machineId(): string {
    if (this.cachedMachineId) return this.cachedMachineId
    const file = process.env.MACHINE_ID_PATH ??
      path.join(path.dirname(path.resolve(process.env.DB_PATH ?? './data/ventas.db')), 'machine-id')
    let id = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : ''
    if (!id) {
      id = crypto.randomUUID()
      fs.writeFileSync(file, id)
    }
    this.cachedMachineId = id
    return id
  }

  machineName(): string {
    return os.hostname()
  }

  isPrincipal(): boolean {
    if (!usesSharedDb()) return true
    return this.get(KEY_ID) === this.machineId()
  }

  status(): PrincipalStatus {
    const shared = usesSharedDb()
    return {
      sharedDb: shared,
      machineName: this.machineName(),
      isPrincipal: this.isPrincipal(),
      principalName: shared ? this.get(KEY_NAME) : this.machineName(),
      principalSince: shared ? this.get(KEY_SINCE) : null,
    }
  }

  setThisAsPrincipal(): PrincipalStatus {
    if (!usesSharedDb()) throw new Error('Con la base local esta PC ya es la principal')
    const upsert = this.db.prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (@key, @value, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    this.db.transaction(() => {
      upsert.run({ key: KEY_ID, value: this.machineId() })
      upsert.run({ key: KEY_NAME, value: this.machineName() })
      upsert.run({ key: KEY_SINCE, value: localNow() })
    })()
    return this.status()
  }

  private get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }
}

let instance: PrincipalService | null = null

export function initPrincipalService(db: Database): PrincipalService {
  instance = new PrincipalService(db)
  return instance
}

/** Para los módulos que solo deben actuar en la PC principal (AFIP, sync). */
export function isPrincipalPc(): boolean {
  return instance ? instance.isPrincipal() : !usesSharedDb()
}

export function principalName(): string | null {
  return instance?.status().principalName ?? null
}
