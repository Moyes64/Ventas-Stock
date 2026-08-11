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

/**
 * Convierte un timestamp UTC (ISO 8601 con 'Z', o un DATETIME crudo de MySQL sin
 * timezone tipo "YYYY-MM-DD HH:MM:SS" — se asume UTC en ese caso) a la fecha
 * LOCAL en formato YYYY-MM-DD.
 *
 * Usar siempre para timestamps que vienen de otro servidor en UTC (p. ej.
 * `created_at` de la tienda web en Hostinger). Nunca hacer `utcString.slice(0, 10)`
 * directamente: eso toma el día calendario UTC, no el local (ART = UTC-3), y una
 * venta de la noche puede quedar fechada al día siguiente.
 */
export function utcToLocalDate(utcTimestamp: string): string {
  const hasTimezone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(utcTimestamp)
  const iso = hasTimezone ? utcTimestamp : `${utcTimestamp.replace(' ', 'T')}Z`
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
