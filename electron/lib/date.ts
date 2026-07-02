/**
 * Utilidades de fecha para el proceso main de Electron.
 * Siempre usar estas funciones en lugar de toISOString() / date('now')
 * ya que SQLite y JS Date usan UTC, no la hora local (ART = UTC-3).
 */

/** Fecha local actual en formato YYYY-MM-DD */
export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Timestamp local actual en formato YYYY-MM-DD HH:MM:SS (para updated_at, etc.) */
export function localNow(): string {
  const d = new Date()
  return (
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` +
    ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  )
}
