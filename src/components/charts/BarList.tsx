export interface BarListItem {
  label: string
  count: number
}

/**
 * Lista de barras horizontales simple (etiqueta + barra + valor), en el
 * mismo estilo artesanal que PieChart.tsx / LineChart.tsx. Pensada para
 * rankings cortos (5-6 ítems) donde una barra por fila es más legible que
 * una torta.
 */
export function BarList({ items, color = '#4f8ef7' }: { items: BarListItem[]; color?: string }) {
  const max = Math.max(...items.map(i => i.count), 1)

  if (items.length === 0) {
    return <div className="barlist-empty">Sin datos</div>
  }

  return (
    <div className="barlist">
      {items.map(it => (
        <div key={it.label} className="barlist-row">
          <span className="barlist-label">{it.label}</span>
          <div className="barlist-track">
            <div className="barlist-fill" style={{ width: `${(it.count / max) * 100}%`, background: color }} />
          </div>
          <span className="barlist-count">{it.count}</span>
        </div>
      ))}
    </div>
  )
}
