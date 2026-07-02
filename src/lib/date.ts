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
