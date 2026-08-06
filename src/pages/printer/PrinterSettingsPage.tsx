import { useEffect, useState } from 'react'
import { printerConfig as printerApi } from '../../lib/ipc'
import type { PrinterConfig } from '../../types/ipc'

const DEFAULT: PrinterConfig = {
  connectionType: 'usb',
  ip: '',
  port: 9100,
  usbPrinterName: '',
  darkness: 4,
  speed: 'normal',
  enabled: false,
}

const DARKNESS_LABELS: Record<number, string> = {
  1: 'Muy claro', 2: 'Claro', 3: 'Normal claro',
  4: 'Normal', 5: 'Oscuro', 6: 'Muy oscuro', 7: 'Máximo',
}

export default function PrinterSettingsPage() {
  const [config, setConfig] = useState<PrinterConfig>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)

  const [windowsPrinters, setWindowsPrinters] = useState<string[]>([])
  const [loadingPrinters, setLoadingPrinters] = useState(false)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  const [printing, setPrinting] = useState(false)
  const [printResult, setPrintResult] = useState<{ success: boolean; error?: string } | null>(null)

  useEffect(() => {
    printerApi.get()
      .then(cfg => { setConfig(cfg); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleLoadPrinters() {
    setLoadingPrinters(true)
    try {
      const list = await printerApi.listPrinters()
      setWindowsPrinters(list)
    } finally {
      setLoadingPrinters(false)
    }
  }

  async function handleSave() {
    setSaving(true); setSaveOk(false)
    try {
      await printerApi.save(config)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    } finally { setSaving(false) }
  }

  async function handleTestConnection() {
    setTesting(true); setTestResult(null)
    try {
      const result = await printerApi.testConnection(config)
      setTestResult(result)
    } finally { setTesting(false) }
  }

  async function handlePrintTest() {
    setPrinting(true); setPrintResult(null)
    try {
      const result = await printerApi.printTest(config)
      setPrintResult(result)
    } finally { setPrinting(false) }
  }

  const canTest = config.connectionType === 'usb'
    ? !!config.usbPrinterName.trim()
    : !!config.ip.trim()

  if (loading) return <div className="page"><p>Cargando...</p></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🖨️ Configuración de Impresora</h1>
      </div>

      <div className="printer-settings-layout">

        {/* ── Habilitación ─────────────────────────────────────────────────── */}
        <section className="card printer-section">
          <h2 className="printer-section-title">Estado</h2>
          <label className="filter-check" style={{ fontSize: '1rem', gap: '10px' }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig({ ...config, enabled: e.target.checked })}
              style={{ width: 18, height: 18 }}
            />
            Impresión térmica ESC/POS habilitada
          </label>
          <p className="printer-section-desc" style={{ marginTop: 8 }}>
            Si está deshabilitada, los tickets se imprimen por el sistema operativo (método anterior).
          </p>
        </section>

        {/* ── Tipo de conexión ─────────────────────────────────────────────── */}
        <section className="card printer-section">
          <h2 className="printer-section-title">Tipo de conexión</h2>
          <div className="printer-speed-options">
            <label className={`printer-speed-option ${config.connectionType === 'usb' ? 'printer-speed-option--active' : ''}`}>
              <input type="radio" name="connType" value="usb"
                checked={config.connectionType === 'usb'}
                onChange={() => setConfig({ ...config, connectionType: 'usb' })} />
              <span>🔌 USB (Windows)</span>
            </label>
            <label className={`printer-speed-option ${config.connectionType === 'tcp' ? 'printer-speed-option--active' : ''}`}>
              <input type="radio" name="connType" value="tcp"
                checked={config.connectionType === 'tcp'}
                onChange={() => setConfig({ ...config, connectionType: 'tcp' })} />
              <span>🌐 Red (TCP/IP)</span>
            </label>
          </div>
        </section>

        {/* ── Conexión USB ─────────────────────────────────────────────────── */}
        {config.connectionType === 'usb' && (
          <section className="card printer-section">
            <h2 className="printer-section-title">Configuración USB</h2>
            <p className="printer-section-desc">
              Seleccioná la impresora instalada en Windows. Debe tener un driver instalado
              (puede ser "Generic / Text Only" o el driver propio de la POS80).
              Los datos ESC/POS se envían en modo RAW a través del spooler de Windows.
            </p>

            <div className="printer-usb-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="label">Nombre de impresora en Windows</label>
                <input
                  type="text"
                  className="input"
                  placeholder='Ej: "POS80" o "Generic / Text Only"'
                  value={config.usbPrinterName}
                  onChange={e => setConfig({ ...config, usbPrinterName: e.target.value })}
                />
              </div>
              <div style={{ paddingTop: 22 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => void handleLoadPrinters()}
                  disabled={loadingPrinters}
                  title="Obtener lista de impresoras instaladas en este equipo"
                >
                  {loadingPrinters ? '⏳' : '📋 Ver instaladas'}
                </button>
              </div>
            </div>

            {windowsPrinters.length > 0 && (
              <div className="printer-list">
                <p className="printer-list-title">Impresoras instaladas — hacé clic para seleccionar:</p>
                {windowsPrinters.map(name => (
                  <button
                    key={name}
                    className={`printer-list-item ${config.usbPrinterName === name ? 'printer-list-item--active' : ''}`}
                    onClick={() => setConfig({ ...config, usbPrinterName: name })}
                  >
                    🖨️ {name}
                  </button>
                ))}
              </div>
            )}

            <div className="printer-actions" style={{ marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                onClick={() => void handleTestConnection()}
                disabled={testing || !canTest}
              >
                {testing ? '⏳ Verificando...' : '🔍 Verificar impresora'}
              </button>
            </div>

            {testResult && (
              <div className={`alert alert--${testResult.success ? 'success' : 'error'}`}>
                {testResult.success
                  ? `✅ Impresora "${config.usbPrinterName}" encontrada en Windows.`
                  : `❌ ${testResult.error}`}
              </div>
            )}

            <div className="printer-section-desc" style={{ marginTop: 12, padding: '10px 12px', background: 'var(--color-bg)', borderRadius: 6, border: '1px solid var(--color-border)' }}>
              <strong>¿Cómo saber el nombre exacto?</strong><br />
              Panel de control → Dispositivos e impresoras → clic derecho sobre la POS80 → ver "Propiedades de impresora". El nombre que aparece en el título es el que tenés que ingresar aquí.
            </div>
          </section>
        )}

        {/* ── Conexión TCP ─────────────────────────────────────────────────── */}
        {config.connectionType === 'tcp' && (
          <section className="card printer-section">
            <h2 className="printer-section-title">Configuración de Red (TCP/IP)</h2>
            <p className="printer-section-desc">
              La POS80 expone un servidor en el puerto 9100 (modo RAW) cuando está conectada
              por Ethernet o WiFi. Asigná una IP fija o reservada por MAC en el router.
            </p>

            <div className="form-row-inline">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="label">Dirección IP</label>
                <input
                  type="text"
                  className="input"
                  placeholder="192.168.1.100"
                  value={config.ip}
                  onChange={e => setConfig({ ...config, ip: e.target.value.trim() })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="label">Puerto</label>
                <input
                  type="number"
                  className="input"
                  value={config.port}
                  min={1} max={65535}
                  onChange={e => setConfig({ ...config, port: parseInt(e.target.value) || 9100 })}
                />
              </div>
            </div>

            <div className="printer-actions">
              <button
                className="btn btn-secondary"
                onClick={() => void handleTestConnection()}
                disabled={testing || !canTest}
              >
                {testing ? '⏳ Verificando...' : '🔌 Verificar conexión'}
              </button>
            </div>

            {testResult && (
              <div className={`alert alert--${testResult.success ? 'success' : 'error'}`}>
                {testResult.success
                  ? '✅ Conexión exitosa — la impresora está disponible.'
                  : `❌ Sin conexión: ${testResult.error}`}
              </div>
            )}
          </section>
        )}

        {/* ── Densidad ─────────────────────────────────────────────────────── */}
        <section className="card printer-section">
          <h2 className="printer-section-title">Densidad de impresión (Darkness)</h2>
          <p className="printer-section-desc">
            Comando ESC/POS: <code>ESC 7 n n n</code>. Ajustá hasta que el texto sea nítido sin manchas.
          </p>
          <div className="printer-darkness-row">
            <span className="printer-darkness-label-min">1 Muy claro</span>
            <input
              type="range" min={1} max={7} step={1}
              value={config.darkness}
              onChange={e => setConfig({ ...config, darkness: parseInt(e.target.value) })}
              className="printer-slider"
            />
            <span className="printer-darkness-label-max">7 Máximo</span>
          </div>
          <div className="printer-darkness-value">
            Nivel actual: <strong>{config.darkness}</strong> — {DARKNESS_LABELS[config.darkness]}
          </div>
          <div className="printer-darkness-preview">
            {[1,2,3,4,5,6,7].map(n => (
              <div key={n}
                className={`printer-darkness-bar ${n === config.darkness ? 'printer-darkness-bar--active' : ''}`}
                style={{ opacity: n / 7, height: `${8 + n * 4}px` }}
                onClick={() => setConfig({ ...config, darkness: n })}
                title={`Nivel ${n}: ${DARKNESS_LABELS[n]}`}
              />
            ))}
          </div>
        </section>

        {/* ── Velocidad ────────────────────────────────────────────────────── */}
        <section className="card printer-section">
          <h2 className="printer-section-title">Velocidad de impresión</h2>
          <p className="printer-section-desc">
            Si la densidad alta causa atascos o impresión incompleta, probá con velocidad lenta.
          </p>
          <div className="printer-speed-options">
            <label className={`printer-speed-option ${config.speed === 'normal' ? 'printer-speed-option--active' : ''}`}>
              <input type="radio" name="speed" value="normal"
                checked={config.speed === 'normal'}
                onChange={() => setConfig({ ...config, speed: 'normal' })} />
              <span>⚡ Normal</span>
            </label>
            <label className={`printer-speed-option ${config.speed === 'slow' ? 'printer-speed-option--active' : ''}`}>
              <input type="radio" name="speed" value="slow"
                checked={config.speed === 'slow'}
                onChange={() => setConfig({ ...config, speed: 'slow' })} />
              <span>🐢 Lenta</span>
            </label>
          </div>
        </section>

        {/* ── Guardar y probar ─────────────────────────────────────────────── */}
        <section className="card printer-section">
          <h2 className="printer-section-title">Guardar y probar</h2>
          <div className="printer-actions">
            <button className="btn btn-primary btn-lg" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '⏳ Guardando...' : '💾 Guardar configuración'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => void handlePrintTest()}
              disabled={printing || !config.enabled || !canTest}
              title={!config.enabled ? 'Habilitá la impresión térmica primero' : ''}
            >
              {printing ? '⏳ Imprimiendo...' : '🖨️ Imprimir ticket de prueba'}
            </button>
          </div>

          {saveOk && <div className="alert alert--success">✅ Configuración guardada correctamente.</div>}
          {printResult && (
            <div className={`alert alert--${printResult.success ? 'success' : 'error'}`}>
              {printResult.success
                ? '✅ Ticket de prueba enviado correctamente.'
                : `❌ Error al imprimir: ${printResult.error}`}
            </div>
          )}
          {!config.enabled && (
            <p className="printer-section-desc" style={{ marginTop: 8, color: 'var(--color-warning)' }}>
              ⚠️ La impresión térmica está deshabilitada.
            </p>
          )}
        </section>

        {/* ── Referencia ESC/POS ───────────────────────────────────────────── */}
        {(() => {
          const presets: Record<number, [number,number,number]> = {
            1:[3,40,1], 2:[5,60,1], 3:[7,80,2],
            4:[10,120,3], 5:[15,160,5], 6:[20,200,8], 7:[30,240,12],
          }
          const [n1,n2,n3] = presets[config.darkness] ?? [10,120,3]
          return (
            <section className="card printer-section printer-section--reference">
              <h2 className="printer-section-title">Comandos ESC/POS que se envían</h2>
              <table className="table table--compact">
                <thead><tr><th>Función</th><th>Parámetros</th><th>Bytes enviados</th></tr></thead>
                <tbody>
                  <tr><td>Reset impresora</td><td>ESC @</td><td><code>1B 40</code></td></tr>
                  <tr>
                    <td>Densidad nivel {config.darkness}</td>
                    <td>ESC 7 n1={n1} n2={n2} n3={n3}</td>
                    <td><code>1B 37 {n1.toString(16).padStart(2,'0').toUpperCase()} {n2.toString(16).padStart(2,'0').toUpperCase()} {n3.toString(16).padStart(2,'0').toUpperCase()}</code></td>
                  </tr>
                  <tr><td>Corte parcial</td><td>GS V 1</td><td><code>1D 56 01</code></td></tr>
                </tbody>
              </table>
              <p className="printer-section-desc" style={{marginTop:8}}>
                <strong>n1</strong> = max dots ({n1}) · <strong>n2</strong> = heating time ({n2}) · <strong>n3</strong> = interval ({n3}).
                El parámetro n2 es el principal controlador de oscuridad.
              </p>
            </section>
          )
        })()}

      </div>
    </div>
  )
}
