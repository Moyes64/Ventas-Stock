export interface PrincipalStatus {
  /** true = base compartida en la nube (Turso); false = archivo local, una sola PC. */
  sharedDb: boolean
  /** Nombre de esta PC (hostname). */
  machineName: string
  isPrincipal: boolean
  /** Nombre de la PC principal (null: todavía no se eligió ninguna). */
  principalName: string | null
  principalSince: string | null
}
