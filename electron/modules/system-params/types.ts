export interface SystemParams {
  // Datos del comercio
  denominacion: string
  calle: string
  numero: string
  codigoPostal: string
  contactoNombre: string
  contactoEmail: string
  telefonoContacto: string
  // Datos ARCA
  categoriaIva: 'Monotributo' | 'Responsable Inscripto'
  cuitCuil: string
  inicioActividades: string          // YYYY-MM-DD
  condicionIIBB: 'Exento' | 'Inscripto'
  nroIIBB: string                    // Solo si condicionIIBB === 'Inscripto'
  ambienteArca: 'homologacion' | 'produccion'
  puntoVenta: string
  // SMTP para envío de facturas por email
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFromName: string
  // Tienda web
  costoEnvioWeb: number
  // Cambios y devoluciones
  diasCambio: number
}

export const DEFAULT_SYSTEM_PARAMS: SystemParams = {
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
  ambienteArca: 'homologacion',
  puntoVenta: '1',
  smtpHost: '',
  smtpPort: 465,
  smtpUser: '',
  smtpPass: '',
  smtpFromName: '',
  costoEnvioWeb: 0,
  diasCambio: 30,
}
