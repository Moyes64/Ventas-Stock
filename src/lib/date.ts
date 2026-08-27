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
