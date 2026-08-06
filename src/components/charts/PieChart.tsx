export const PIE_COLORS = [
  '#4f8ef7', '#f7874f', '#4fd38e', '#f74f7e', '#d4e04f',
  '#7c4ff7', '#4fcff7', '#f7c74f', '#9bf74f', '#f74fc4',
]

export interface PieChartItem {
  label: string
  value: number
}

interface PieSlice extends PieChartItem {
  color: string
}

export function PieChart({ items, label }: { items: PieChartItem[]; label: string }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0 || items.length === 0) {
    return <div className="pie-empty">Sin datos</div>
  }

  const SIZE = 200
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R = 80

  const slices: PieSlice[] = items.map((it, idx) => ({
    label: it.label,
    value: it.value,
    color: PIE_COLORS[idx % PIE_COLORS.length],
  }))

  // Build arc paths
  let startAngle = -Math.PI / 2
  const paths = slices.map((s, idx) => {
    const angle = (s.value / total) * 2 * Math.PI
    const endAngle = startAngle + angle
    const x1 = CX + R * Math.cos(startAngle)
    const y1 = CY + R * Math.sin(startAngle)
    const x2 = CX + R * Math.cos(endAngle)
    const y2 = CY + R * Math.sin(endAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const d = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`
    startAngle = endAngle
    return <path key={idx} d={d} fill={s.color} stroke="#fff" strokeWidth={1} />
  })

  return (
    <div className="pie-wrapper">
      <h3 className="pie-title">{label}</h3>
      <div className="pie-body">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {paths}
        </svg>
        <div className="pie-legend">
          {slices.map((s, idx) => (
            <div key={idx} className="pie-legend-item">
              <span className="pie-legend-dot" style={{ background: s.color }} />
              <span className="pie-legend-name" title={s.label}>
                {s.label.length > 22 ? s.label.slice(0, 20) + '…' : s.label}
              </span>
              <span className="pie-legend-value">
                {((s.value / total) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
