export interface LineChartPoint {
  x: number   // día del mes (1-31)
  y: number   // monto
}

export interface LineChartSeries {
  label: string
  color: string
  points: LineChartPoint[]
}

const WIDTH = 760
const HEIGHT = 320
const MARGIN = { top: 16, right: 16, bottom: 32, left: 64 }
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom

function compactCurrency(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(n)
}

/**
 * Gráfico de líneas multi-serie sobre SVG (no hay librería de gráficos instalada,
 * se sigue el mismo patrón artesanal que PieChart.tsx). Eje X = día del mes (1..maxDay),
 * eje Y = monto. Cada serie dibuja solo los puntos que trae — si una serie arranca
 * en el día 24 (p.ej. el mes en que empezó a llevarse el registro), la línea
 * simplemente no aparece antes de ese día en vez de mostrar un cero engañoso.
 */
export function LineChart({
  series,
  maxDay = 31,
  yFormatter = compactCurrency,
  emptyLabel = 'Sin datos para mostrar',
}: {
  series: LineChartSeries[]
  maxDay?: number
  yFormatter?: (n: number) => string
  emptyLabel?: string
}) {
  const allValues = series.flatMap(s => s.points.map(p => p.y))
  const hasData = allValues.length > 0

  if (!hasData) {
    return <div className="linechart-empty">{emptyLabel}</div>
  }

  const maxY = Math.max(...allValues, 0)
  const yTop = maxY === 0 ? 1 : maxY * 1.08

  const xScale = (day: number) => MARGIN.left + ((day - 1) / (maxDay - 1)) * PLOT_W
  const yScale = (value: number) => MARGIN.top + PLOT_H - (value / yTop) * PLOT_H

  const yTicks = 4
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => (yTop / yTicks) * i)

  const xTickDays = Array.from({ length: maxDay }, (_, i) => i + 1)
    .filter(d => d === 1 || d === maxDay || d % 5 === 0)

  return (
    <div className="linechart-wrapper">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="linechart-svg"
        role="img"
        aria-label="Gráfico de ventas por día"
      >
        {/* Grid horizontal + labels eje Y */}
        {yTickValues.map((v, idx) => (
          <g key={idx}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={yScale(v)}
              y2={yScale(v)}
              className="linechart-grid"
            />
            <text x={MARGIN.left - 8} y={yScale(v)} className="linechart-axis-label" textAnchor="end" dy="0.32em">
              {yFormatter(v)}
            </text>
          </g>
        ))}

        {/* Eje X labels */}
        {xTickDays.map(d => (
          <text
            key={d}
            x={xScale(d)}
            y={HEIGHT - MARGIN.bottom + 18}
            className="linechart-axis-label"
            textAnchor="middle"
          >
            {d}
          </text>
        ))}

        {/* Líneas */}
        {series.map((s, idx) => {
          if (s.points.length === 0) return null
          const sorted = [...s.points].sort((a, b) => a.x - b.x)
          const d = sorted
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x)} ${yScale(p.y)}`)
            .join(' ')
          return (
            <g key={idx}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {sorted.map((p, pidx) => (
                <circle key={pidx} cx={xScale(p.x)} cy={yScale(p.y)} r={2.5} fill={s.color}>
                  <title>{`${s.label} — día ${p.x}: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(p.y)}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>

      <div className="linechart-legend">
        {series.map((s, idx) => (
          <div key={idx} className="linechart-legend-item">
            <span className="linechart-legend-dot" style={{ background: s.color }} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
