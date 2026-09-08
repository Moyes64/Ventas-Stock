/**
 * Devuelve la fecha local actual en formato YYYY-MM-DD.
 * Usar siempre en lugar de new Date().toISOString().slice(0,10)
 * que devuelve fecha UTC y puede diferir de la fecha local en ART (UTC-3).
 */
export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Primer día del mes actual en formato YYYY-MM-DD (fecha local).
 */
export function localFirstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Mes actual en formato YYYY-MM (para input type="month").
 */
export function localCurrentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Formatea una fecha YYYY-MM-DD como "día de la semana dd/mm/aaaa" (ej: "miércoles 27/08/2026").
 * Construye el Date con año/mes/día locales para evitar el corrimiento de un día
 * que produce `new Date('YYYY-MM-DD')` (lo interpreta como UTC medianoche).
 */
export function formatWeekdayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekday = date.toLocaleDateString('es-AR', { weekday: 'long' })
  const ddmmyyyy = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${ddmmyyyy}`
}

/**
 * Formatea cualquier fecha (string YYYY-MM-DD, timestamp ISO/MySQL, o Date) como "dd/mm/aaaa".
 * Es la función a usar en toda la UI para mostrar fechas de forma consistente.
 * Un string "YYYY-MM-DD" (sin hora) se interpreta como fecha LOCAL, no UTC, para evitar
 * el corrimiento de un día que produce `new Date('YYYY-MM-DD')`.
 * Devuelve '' si el valor es null/undefined/vacío o no se puede interpretar.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return ''
    return `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return `${d}/${m}/${y}`
  }
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/**
 * Formatea una fecha/hora (timestamp ISO/MySQL, o Date) como "dd/mm/aaaa HH:MM".
 * Devuelve '' si el valor es null/undefined/vacío o no se puede interpretar.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === '') return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return typeof value === 'string' ? value : ''
  const datePart = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const timePart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${datePart} ${timePart}`
}
