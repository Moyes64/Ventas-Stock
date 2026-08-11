import { useEffect, useState } from 'react'
import { systemParams as systemParamsApi } from '../../lib/ipc'
import type { SystemParams } from '../../types/ipc'

const electron = (window as Window & { electron?: {
  csr?: {
    generate: (i: unknown) => Promise<{ success: boolean; csrPem?: string; csrPath?: string; keyPath?: string; error?: string }>
    importCert: () => Promise<{ success: boolean; certPath?: string; error?: string }>
  }
} }).electron

const EMPTY: SystemParams = {
  denominacion: '',
  calle: '',
  numero: '',
  codigoPostal: '',
  contactoNombre: '',
  contactoEmail: '',
  telefonoContacto: '',
  categoriaIva: 'Monotributo',
  cuitCuil: '',
  inicioActividades: '',
  condicionIIBB: 'Exento',
  nroIIBB: '',
  anthropicApiKey: '',
  ambienteArca: 'homologacion',
  puntoVenta: '1',
  smtpHost: '',
  smtpPort: 465,
  smtpUser: '',
  smtpPass: '',
  smtpFromName: '',
  costoEnvioWeb: 0,
  recargoTarjetaCreditoWeb: 10,
  diasCambio: 30,
}

export default function SystemParamsPage() {
  const [form, setForm] = useState<SystemParams>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const [csrLocalidad, setCsrLocalidad] = useState('')
  const [csrProvincia, setCsrProvincia] = useState('')
  const [csrGenerating, setCsrGenerating] = useState(false)
  const [csrResult, setCsrResult] = useState<{ pem: string; csrPath: string; keyPath: string } | null>(null)
  const [csrErr, setCsrErr] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [importErr, setImportErr] = useState<string | null>(null)

  useEffect(() => {
    void systemParamsApi.get().then(p => {
      setForm(p)
      setLoading(false)
    })
  }, [])

  function set(field: keyof SystemParams, value: string) {
    setSaveMsg(null)
    setSaveErr(null)
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleImportCert() {
    setImportMsg(null)
    setImportErr(null)
    const res = await electron?.csr?.importCert(form.ambienteArca)
    if (!res || !res.success) {
      if (res?.error !== 'Cancelado.') setImportErr(res?.error ?? 'Error al importar el certificado.')
    } else {
      setImportMsg(`✅ Certificado importado correctamente en: ${res.certPath}`)
    }
  }

  async function handleGenerateCsr() {
    setCsrErr(null)
    setCsrResult(null)
    if (!form.cuitCuil.trim()) { setCsrErr('Ingresá el CUIT antes de generar el CSR.'); return }
    if (!form.denominacion.trim()) { setCsrErr('Ingresá la Denominación antes de generar el CSR.'); return }
    setCsrGenerating(true)
    try {
      const res = await electron?.csr?.generate({
        cuit: form.cuitCuil,
        denominacion: form.denominacion,
        localidad: csrLocalidad,
        provincia: csrProvincia,
        ambiente: form.ambienteArca,
      })
      if (!res || !res.success) {
        setCsrErr(res?.error ?? 'Error desconocido al generar el CSR.')
      } else {
        setCsrResult({ pem: res.csrPem ?? '', csrPath: res.csrPath ?? '', keyPath: res.keyPath ?? '' })
      }
    } catch (err) {
      setCsrErr(err instanceof Error ? err.message : String(err))
    } finally {
      setCsrGenerating(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveMsg(null)
    setSaveErr(null)
    setSaving(true)
    try {
      await systemParamsApi.save(form)
      setSaveMsg('✅ Parámetros guardados correctamente')
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page"><p>Cargando...</p></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">⚙️ Parámetros del Sistema</h1>
      </div>

      <form onSubmit={e => { void handleSave(e) }} className="sysparam-form">

        {/* ── Datos del comercio ─────────────────────────────────────────── */}
        <div className="sysparam-section">
          <h2 className="sysparam-section-title">🏪 Datos del Comercio</h2>

          <div className="sysparam-grid">
            <div className="form-group sysparam-full">
              <label className="label">Denominación *</label>
              <input
                type="text"
                value={form.denominacion}
                onChange={e => set('denominacion', e.target.value)}
                className="input"
                placeholder="Nombre de fantasía del negocio"
              />
            </div>

            <div className="form-group sysparam-col2">
              <label className="label">Calle</label>
              <input
                type="text"
                value={form.calle}
                onChange={e => set('calle', e.target.value)}
                className="input"
                placeholder="Nombre de la calle"
              />
            </div>
            <div className="form-group sysparam-col1">
              <label className="label">Número</label>
              <input
                type="text"
                value={form.numero}
                onChange={e => set('numero', e.target.value)}
                className="input"
                placeholder="Ej: 1234"
              />
            </div>
            <div className="form-group sysparam-col1">
              <label className="label">Código Postal</label>
              <input
                type="text"
                value={form.codigoPostal}
                onChange={e => set('codigoPostal', e.target.value)}
                className="input"
                placeholder="Ej: 1414"
              />
            </div>

            <div className="form-group sysparam-col2">
              <label className="label">Contacto (Nombre y Apellido)</label>
              <input
                type="text"
                value={form.contactoNombre}
                onChange={e => set('contactoNombre', e.target.value)}
                className="input"
                placeholder="Nombre completo del contacto"
              />
            </div>
            <div className="form-group sysparam-col2">
              <label className="label">Email del Contacto</label>
              <input
                type="email"
                value={form.contactoEmail}
                onChange={e => set('contactoEmail', e.target.value)}
                className="input"
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div className="form-group sysparam-col2">
              <label className="label">Teléfono de Contacto</label>
              <input
                type="text"
                value={form.telefonoContacto}
                onChange={e => set('telefonoContacto', e.target.value)}
                className="input"
                placeholder="Ej: 11-1234-5678"
              />
            </div>
          </div>
        </div>

        {/* ── Datos ARCA ─────────────────────────────────────────────────── */}
        <div className="sysparam-section">
          <h2 className="sysparam-section-title">🏛️ Datos ARCA</h2>

          <div className="sysparam-grid">
            <div className="form-group sysparam-col2">
              <label className="label">Categoría</label>
              <select
                value={form.categoriaIva}
                onChange={e => set('categoriaIva', e.target.value)}
                className="select"
              >
                <option value="Monotributo">Monotributo</option>
                <option value="Responsable Inscripto">Responsable Inscripto</option>
              </select>
            </div>
            <div className="form-group sysparam-col2">
              <label className="label">CUIT / CUIL</label>
              <input
                type="text"
                value={form.cuitCuil}
                onChange={e => set('cuitCuil', e.target.value)}
                className="input"
                placeholder="Ej: 27-12345678-9"
              />
            </div>

            <div className="form-group sysparam-col2">
              <label className="label">Fecha de inicio de actividades</label>
              <input
                type="date"
                value={form.inicioActividades}
                onChange={e => set('inicioActividades', e.target.value)}
                className="input"
              />
            </div>

            <div className="form-group sysparam-col2">
              <label className="label">Condición IIBB</label>
              <select
                value={form.condicionIIBB}
                onChange={e => set('condicionIIBB', e.target.value)}
                className="select"
              >
                <option value="Exento">Exento</option>
                <option value="Inscripto">Inscripto</option>
              </select>
            </div>

            {form.condicionIIBB === 'Inscripto' && (
              <div className="form-group sysparam-col2">
                <label className="label">Número IIBB</label>
                <input
                  type="text"
                  value={form.nroIIBB}
                  onChange={e => set('nroIIBB', e.target.value)}
                  className="input"
                  placeholder="Ej: 123-456789-0"
                />
              </div>
            )}

            <div className="form-group sysparam-col2">
              <label className="label">Punto de Venta</label>
              <input
                type="number"
                min={1}
                max={9999}
                value={form.puntoVenta}
                onChange={e => set('puntoVenta', e.target.value)}
                className="input"
                placeholder="Ej: 1"
              />
            </div>

            <div className="form-group sysparam-col2">
              <label className="label">Ambiente ARCA</label>
              <select
                value={form.ambienteArca}
                onChange={e => set('ambienteArca', e.target.value)}
                className="select"
              >
                <option value="homologacion">Homologación (pruebas)</option>
                <option value="produccion">Producción</option>
              </select>
            </div>

            {form.ambienteArca === 'produccion' && (
              <div className="sysparam-full">
                <div className="sysparam-warning">
                  ⚠️ <strong>Ambiente de PRODUCCIÓN activo.</strong> Los comprobantes emitidos
                  serán válidos fiscalmente ante ARCA. Asegurate de tener el certificado
                  digital de producción instalado en la carpeta <code>certs\</code>.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Escáner de Remitos ─────────────────────────────────────────── */}
        <div className="sysparam-section">
          <h2 className="sysparam-section-title">🤖 Escáner de Remitos (Claude AI)</h2>
          <div className="sysparam-grid">
            <div className="form-group sysparam-full">
              <label className="label">API Key de Anthropic</label>
              <input
                type="password"
                value={form.anthropicApiKey}
                onChange={e => set('anthropicApiKey', e.target.value)}
                className="input"
                placeholder="sk-ant-..."
              />
              <span className="field-hint">
                Obtené tu API key en <strong>console.anthropic.com</strong> → API Keys.
                Se usa únicamente para el módulo Escáner de Remitos.
              </span>
            </div>
          </div>
        </div>

        {/* ── Certificado Digital ARCA ───────────────────────────────────── */}
        <div className="sysparam-section">
          <h2 className="sysparam-section-title">🔐 Certificado Digital ARCA (Producción)</h2>
          <p className="field-hint" style={{ marginBottom: 16 }}>
            Generá aquí el CSR (Certificate Signing Request) para presentar ante ARCA y obtener
            tu certificado de producción. La clave privada se guarda automáticamente en la carpeta
            de datos del programa. <strong>No compartas ni muevas ese archivo.</strong>
          </p>

          <div className="sysparam-grid">
            <div className="form-group sysparam-col2">
              <label className="label">Localidad</label>
              <input
                type="text"
                value={csrLocalidad}
                onChange={e => setCsrLocalidad(e.target.value)}
                className="input"
                placeholder="Ej: Buenos Aires"
              />
            </div>
            <div className="form-group sysparam-col2">
              <label className="label">Provincia</label>
              <input
                type="text"
                value={csrProvincia}
                onChange={e => setCsrProvincia(e.target.value)}
                className="input"
                placeholder="Ej: Buenos Aires"
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { void handleGenerateCsr() }}
              disabled={csrGenerating}
            >
              {csrGenerating ? 'Generando...' : '🔑 Generar clave privada y CSR'}
            </button>
          </div>

          {csrErr && <p className="error" style={{ marginTop: 12 }}>{csrErr}</p>}

          {/* ── Importar certificado recibido de ARCA ── */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <p className="field-hint" style={{ marginBottom: 10 }}>
              Una vez que ARCA te entregue el certificado (<code>.crt</code> o <code>.pem</code>),
              importalo aquí. Se guardará en la carpeta del ambiente seleccionado actualmente
              ({' '}<strong>{form.ambienteArca}</strong>), sin afectar el otro ambiente.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { void handleImportCert() }}
            >
              📂 Importar certificado ARCA — {form.ambienteArca} (.crt / .pem)
            </button>
            {importMsg && <p className="sysparam-success" style={{ marginTop: 8 }}>{importMsg}</p>}
            {importErr && <p className="error" style={{ marginTop: 8 }}>{importErr}</p>}
          </div>

          {csrResult && (
            <div className="csr-result">
              <p className="sysparam-success" style={{ marginBottom: 8 }}>
                ✅ CSR generado correctamente.
              </p>
              <ul className="csr-paths">
                <li><strong>CSR:</strong> <code>{csrResult.csrPath}</code></li>
                <li><strong>Clave privada:</strong> <code>{csrResult.keyPath}</code></li>
              </ul>
              <p className="field-hint" style={{ marginTop: 8 }}>
                Copiá el texto del CSR de abajo y pegalo en el portal de ARCA →{' '}
                <em>Administración de Certificados Digitales → Nuevo Certificado → Producción</em>.
                Una vez que ARCA te entregue el <code>cert.pem</code>, guardalo en la misma carpeta
                que la clave privada.
              </p>
              <textarea
                readOnly
                className="csr-textarea"
                value={csrResult.pem}
                rows={12}
                onClick={e => (e.target as HTMLTextAreaElement).select()}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 8 }}
                onClick={() => { void navigator.clipboard.writeText(csrResult.pem) }}
              >
                📋 Copiar CSR al portapapeles
              </button>
            </div>
          )}
        </div>

        {/* ── Correo electrónico (SMTP) ─────────────────────────────────── */}
        <div className="sysparam-section">
          <h2 className="sysparam-section-title">📧 Envío de Facturas por Email (SMTP)</h2>
          <p className="field-hint" style={{ marginBottom: 16 }}>
            Configurá los datos del servidor de correo para enviar facturas por email a los clientes.
            Para Hostinger usá <strong>smtp.hostinger.com</strong> puerto <strong>465</strong>.
          </p>
          <div className="sysparam-grid">
            <div className="form-group sysparam-col2">
              <label className="label">Servidor SMTP</label>
              <input
                type="text"
                value={form.smtpHost}
                onChange={e => set('smtpHost', e.target.value)}
                className="input"
                placeholder="smtp.hostinger.com"
              />
            </div>
            <div className="form-group sysparam-col2">
              <label className="label">Puerto</label>
              <input
                type="number"
                value={form.smtpPort}
                onChange={e => set('smtpPort', parseInt(e.target.value) || 465)}
                className="input"
                placeholder="465"
              />
            </div>
            <div className="form-group sysparam-col2">
              <label className="label">Usuario (email)</label>
              <input
                type="email"
                value={form.smtpUser}
                onChange={e => set('smtpUser', e.target.value)}
                className="input"
                placeholder="ventas@tudominio.com"
              />
            </div>
            <div className="form-group sysparam-col2">
              <label className="label">Contraseña</label>
              <input
                type="password"
                value={form.smtpPass}
                onChange={e => set('smtpPass', e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </div>
            <div className="form-group sysparam-full">
              <label className="label">Nombre del remitente</label>
              <input
                type="text"
                value={form.smtpFromName}
                onChange={e => set('smtpFromName', e.target.value)}
                className="input"
                placeholder="Nombre que verá el cliente en 'De:'"
              />
            </div>
          </div>
        </div>

        {/* ── Tienda Web ────────────────────────────────────────────────── */}
        <div className="sysparam-section">
          <h2 className="sysparam-section-title">🌐 Tienda Web</h2>
          <p className="field-hint" style={{ marginBottom: 16 }}>
            Parámetros que se sincronizan con la tienda online. El costo de envío se aplica
            automáticamente a los pedidos con envío a domicilio (CABA).
          </p>
          <div className="sysparam-grid">
            <div className="form-group sysparam-col2">
              <label className="label">Costo de envío a domicilio (ARS)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.costoEnvioWeb}
                onChange={e => setForm(f => ({ ...f, costoEnvioWeb: parseFloat(e.target.value) || 0 }))}
                className="input"
                placeholder="Ej: 3500"
              />
              <span className="field-hint">
                Ingresar 0 para envío gratis. Se actualiza en la tienda web con la próxima sincronización.
              </span>
            </div>
            <div className="form-group">
              <label className="label">Recargo tarjeta de crédito (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={form.recargoTarjetaCreditoWeb}
                onChange={e => setForm(f => ({ ...f, recargoTarjetaCreditoWeb: parseFloat(e.target.value) || 0 }))}
                className="input"
                placeholder="Ej: 10"
              />
              <span className="field-hint">
                Se suma al total cuando el cliente elige pagar con tarjeta de crédito en la tienda web.
                El carrito debe avisarlo antes de pagar. Ingresar 0 para desactivar el recargo.
              </span>
            </div>
            <div className="form-group">
              <label className="label">Días para cambio (ticket de cambio)</label>
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                value={form.diasCambio}
                onChange={e => setForm(f => ({ ...f, diasCambio: parseInt(e.target.value) || 30 }))}
                className="input"
                placeholder="30"
              />
              <span className="field-hint">
                Plazo de validez del ticket de cambio a partir de la fecha de venta.
              </span>
            </div>
          </div>
        </div>

        {saveMsg && <p className="sysparam-success">{saveMsg}</p>}
        {saveErr && <p className="error">{saveErr}</p>}

        <div className="sysparam-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? 'Guardando...' : '💾 Guardar parámetros'}
          </button>
        </div>
      </form>
    </div>
  )
}
