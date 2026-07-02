import { useEffect, useState } from 'react'
import { labelConfig as labelApi } from '../../lib/ipc'
import type { LabelConfig, LabelLine, LabelFontSize, LabelAlign } from '../../types/ipc'

const DEFAULT_LINE: LabelLine = { text: '', fontSize: 'normal', alignment: 'center', bold: false }

const DEFAULT_CONFIG: LabelConfig = {
  labelWidthMm: 60,
  labelHeightMm: 20,
  gapMm: 3,
  leftMarginChars: 0,
  lines: [
    { text: '', fontSize: 'large',  alignment: 'center', bold: true  },
    { text: '', fontSize: 'normal', alignment: 'center', bold: false },
    { text: '', fontSize: 'small',  alignment: 'center', bold: false },
  ],
  defaultCopies: 1,
}

const FONT_LABELS: Record<LabelFontSize, string> = {
  small:  'Pequeña',
  normal: 'Normal',
  large:  'Grande',
}

const ALIGN_LABELS: Record<LabelAlign, string> = {
  left:   'Izq',
  center: 'Centro',
  right:  'Der',
}

// Caracteres disponibles aproximados según fuente y ancho
function approxChars(fontSize: LabelFontSize, widthMm: number): number {
  const dots = widthMm * 8
  const dpc = fontSize === 'small' ? 9 : fontSize === 'large' ? 24 : 12
  return Math.floor(dots / dpc)
}

export default function LabelsPage() {
  const [config, setConfig] = useState<LabelConfig>(DEFAULT_CONFIG)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saveOk, setSaveOk]     = useState(false)
  const [copies, setCopies]     = useState(1)
  const [printing, setPrinting] = useState(false)
  const [printResult, setPrintResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [feedMm, setFeedMm]     = useState(5)
  const [feeding, setFeeding]   = useState(false)
  const [feedResult, setFeedResult] = useState<{ success: boolean; error?: string } | null>(null)

  useEffect(() => {
    labelApi.get()
      .then(cfg => { setConfig(cfg); setCopies(cfg.defaultCopies); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function updateLine(idx: number, patch: Partial<LabelLine>) {
    const lines = config.lines.map((l, i) => i === idx ? { ...l, ...patch } : l)
    setConfig({ ...config, lines })
  }

  function addLine() {
    if (config.lines.length >= 6) return
    setConfig({ ...config, lines: [...config.lines, { ...DEFAULT_LINE }] })
  }

  function removeLine(idx: number) {
    if (config.lines.length <= 1) return
    setConfig({ ...config, lines: config.lines.filter((_, i) => i !== idx) })
  }

  async function handleSave() {
    setSaving(true); setSaveOk(false)
    try {
      await labelApi.save({ ...config, defaultCopies: copies })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    } finally { setSaving(false) }
  }

  async function handlePrint() {
    setPrinting(true); setPrintResult(null)
    try {
      const result = await labelApi.print(config, copies)
      setPrintResult(result)
    } finally { setPrinting(false) }
  }

  async function handleFeed() {
    setFeeding(true); setFeedResult(null)
    try {
      const result = await labelApi.feed(feedMm)
      setFeedResult(result)
    } finally { setFeeding(false) }
  }

  const hasContent = config.lines.some(l => l.text.trim() !== '')

  if (loading) return <div className="page"><p>Cargando...</p></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🏷️ Impresión de Etiquetas</h1>
      </div>

      <div className="labels-layout">

        {/* ── Medidas del rollo ──────────────────────────────────────────────── */}
        <section className="card printer-section">
          <h2 className="printer-section-title">Medidas del rollo</h2>
          <p className="printer-section-desc">
            Ingresá las dimensiones físicas de las etiquetas y el espacio entre ellas.
          </p>

          <div className="form-row-inline">
            <div className="form-group">
              <label className="label">Ancho etiqueta (mm)</label>
              <input type="number" className="input" min={20} max={80}
                value={config.labelWidthMm}
                onChange={e => setConfig({ ...config, labelWidthMm: Number(e.target.value) || 60 })} />
            </div>
            <div className="form-group">
              <label className="label">Alto etiqueta (mm)</label>
              <input type="number" className="input" min={5} max={100}
                value={config.labelHeightMm}
                onChange={e => setConfig({ ...config, labelHeightMm: Number(e.target.value) || 20 })} />
            </div>
            <div className="form-group">
              <label className="label">Gap entre etiquetas (mm)</label>
              <input type="number" className="input" min={0} max={30} step={0.5}
                value={config.gapMm}
                onChange={e => setConfig({ ...config, gapMm: Number(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label className="label">Margen izquierdo (chars)</label>
              <input type="number" className="input" min={0} max={10}
                value={config.leftMarginChars}
                onChange={e => setConfig({ ...config, leftMarginChars: Number(e.target.value) || 0 })} />
            </div>
          </div>

          <div className="label-dims-info">
            <span>Área imprimible: <strong>{config.labelWidthMm}mm × {config.labelHeightMm}mm</strong></span>
            <span>Gap: <strong>{config.gapMm}mm</strong></span>
            <span>Paso total: <strong>{config.labelHeightMm + config.gapMm}mm</strong></span>
          </div>
        </section>

        {/* ── Contenido de la etiqueta ───────────────────────────────────────── */}
        <section className="card printer-section">
          <h2 className="printer-section-title">Contenido de la etiqueta</h2>
          <p className="printer-section-desc">
            Configurá hasta 6 líneas de texto. Las líneas vacías se omiten.
          </p>

          <div className="label-lines">
            {config.lines.map((line, idx) => {
              const max = approxChars(line.fontSize, config.labelWidthMm) - config.leftMarginChars
              return (
                <div key={idx} className="label-line-row">
                  <span className="label-line-num">{idx + 1}</span>

                  <input
                    type="text"
                    className="input label-line-text"
                    placeholder={`Línea ${idx + 1} (vacía = omitida)`}
                    maxLength={max}
                    value={line.text}
                    onChange={e => updateLine(idx, { text: e.target.value })}
                  />

                  <select className="input label-line-select"
                    value={line.fontSize}
                    onChange={e => updateLine(idx, { fontSize: e.target.value as LabelFontSize })}>
                    {(Object.keys(FONT_LABELS) as LabelFontSize[]).map(f => (
                      <option key={f} value={f}>{FONT_LABELS[f]}</option>
                    ))}
                  </select>

                  <select className="input label-line-select"
                    value={line.alignment}
                    onChange={e => updateLine(idx, { alignment: e.target.value as LabelAlign })}>
                    {(Object.keys(ALIGN_LABELS) as LabelAlign[]).map(a => (
                      <option key={a} value={a}>{ALIGN_LABELS[a]}</option>
                    ))}
                  </select>

                  <label className="label-line-bold" title="Negrita">
                    <input type="checkbox" checked={line.bold}
                      onChange={e => updateLine(idx, { bold: e.target.checked })} />
                    <strong>N</strong>
                  </label>

                  <span className="label-line-hint">{line.text.length}/{max} chars</span>

                  <button className="btn btn-danger btn-sm"
                    onClick={() => removeLine(idx)}
                    disabled={config.lines.length <= 1}
                    title="Eliminar línea">✕</button>
                </div>
              )
            })}
          </div>

          {config.lines.length < 6 && (
            <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={addLine}>
              + Agregar línea
            </button>
          )}

          {/* Preview visual */}
          <div className="label-preview-wrapper">
            <p className="printer-section-desc" style={{ marginBottom: 6 }}>Vista previa aproximada:</p>
            <div className="label-preview"
              style={{ width: `${config.labelWidthMm * 2}px`, height: `${config.labelHeightMm * 2}px` }}>
              {config.lines.filter(l => l.text.trim()).map((line, idx) => (
                <div key={idx} className={`label-preview-line label-preview-line--${line.fontSize}`}
                  style={{ textAlign: line.alignment, fontWeight: line.bold ? 'bold' : 'normal',
                    paddingLeft: config.leftMarginChars * 4 }}>
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Alineación del rollo ───────────────────────────────────────────── */}
        <section className="card printer-section">
          <h2 className="printer-section-title">Alineación del rollo</h2>
          <p className="printer-section-desc">
            Usá este botón para avanzar el papel manualmente y posicionar
            el borde superior de la primera etiqueta frente al cabezal de impresión.
            Una vez alineada la primera etiqueta, las siguientes se posicionan solas.
          </p>
          <div className="printer-actions" style={{ alignItems: 'center' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="label">Avanzar (mm)</label>
              <input type="number" className="input" style={{ width: 80 }}
                min={1} max={100} step={1}
                value={feedMm}
                onChange={e => setFeedMm(Number(e.target.value) || 5)} />
            </div>
            <button className="btn btn-secondary" style={{ marginTop: 18 }}
              onClick={() => void handleFeed()} disabled={feeding}>
              {feeding ? '⏳' : '⬆️ Avanzar papel'}
            </button>
          </div>
          {feedResult && (
            <div className={`alert alert--${feedResult.success ? 'success' : 'error'}`} style={{ marginTop: 8 }}>
              {feedResult.success ? '✅ Papel avanzado.' : `❌ ${feedResult.error}`}
            </div>
          )}
        </section>

        {/* ── Imprimir ───────────────────────────────────────────────────────── */}
        <section className="card printer-section">
          <h2 className="printer-section-title">Imprimir</h2>
          <div className="printer-actions" style={{ alignItems: 'center' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="label">Cantidad de etiquetas</label>
              <input type="number" className="input" style={{ width: 80 }}
                min={1} max={999}
                value={copies}
                onChange={e => setCopies(Number(e.target.value) || 1)} />
            </div>
            <button className="btn btn-primary btn-lg" style={{ marginTop: 18 }}
              onClick={() => void handlePrint()}
              disabled={printing || !hasContent}
              title={!hasContent ? 'Ingresá al menos una línea de texto' : ''}>
              {printing ? '⏳ Imprimiendo...' : '🖨️ Imprimir etiquetas'}
            </button>
            <button className="btn btn-secondary" style={{ marginTop: 18 }}
              onClick={() => void handleSave()} disabled={saving}>
              {saving ? '⏳' : '💾 Guardar configuración'}
            </button>
          </div>
          {saveOk && <div className="alert alert--success" style={{ marginTop: 8 }}>✅ Configuración guardada.</div>}
          {printResult && (
            <div className={`alert alert--${printResult.success ? 'success' : 'error'}`} style={{ marginTop: 8 }}>
              {printResult.success
                ? `✅ ${copies} etiqueta${copies !== 1 ? 's' : ''} enviada${copies !== 1 ? 's' : ''} a la impresora.`
                : `❌ ${printResult.error}`}
            </div>
          )}
          {!hasContent && (
            <p className="printer-section-desc" style={{ marginTop: 8, color: 'var(--color-warning)' }}>
              ⚠️ Ingresá al menos una línea de texto para poder imprimir.
            </p>
          )}
        </section>

      </div>
    </div>
  )
}
