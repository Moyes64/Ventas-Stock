# Ventas-Stock

Sistema de gestión de Ventas y Stock con facturación electrónica AFIP/ARCA para Argentina.

Aplicación de escritorio construida con **Electron + TypeScript + React + Vite**.

---

## 🧰 Tech Stack

| Capa | Tecnología |
|------|-----------|
| UI | React 18 + TypeScript + React Router |
| Build | Vite + electron-vite |
| Desktop | Electron 39 |
| Base de datos | SQLite (better-sqlite3 v12) |
| Facturación AFIP | WSAA + WSFEv1 (SOAP) |
| Certificados | node-forge (PKCS#7) |
| QR AFIP | qrcode |
| Impresión | thermal-printer-encoder |

---

## 📋 Prerrequisitos

- **Node.js** 18 o superior
- **pnpm** 8 o superior (`npm install -g pnpm`)
- Linux, macOS o Windows

---

## 🚀 Setup de desarrollo

```bash
# 1. Clonar el repositorio
git clone https://github.com/Moyes64/Ventas-Stock.git
cd Ventas-Stock

# 2. Copiar y configurar variables de entorno
cp .env.example .env
# Editar .env con los datos de la empresa

# 3. Instalar dependencias
pnpm install

# 4. Aplicar migraciones
pnpm db:migrate

# 5. Cargar datos iniciales (admin user, productos de ejemplo)
pnpm db:seed

# 6. Iniciar en modo desarrollo
pnpm dev
```

> **Nota:** `pnpm dev` también ejecuta automáticamente las migraciones pendientes
> al arrancar el proceso principal de Electron (`bootstrap()` en `electron/main.ts`).
> Los pasos 4–5 son necesarios sólo si querés poblar la DB antes del primer `pnpm dev`
> o si necesitás el seed de datos iniciales.

> **Variables de entorno:** Al iniciar, `electron/main.ts` carga el archivo `.env`
> de forma explícita (usando `dotenv.config({ path: <appRoot>/.env })`), lo que garantiza
> que `process.env.VITE_EMPRESA_*` esté disponible en el proceso principal para el
> encabezado de impresión (remito interno, facturas). En desarrollo `appRoot` es el
> directorio de trabajo (`process.cwd()`); en producción se usa `process.resourcesPath`.
> Si `.env` no existe, la app muestra un warning en consola pero no se interrumpe.

### Credenciales por defecto (después de seed)
- **Usuario:** `admin`
- **Contraseña:** `admin123`

---

## 🪟 Setup en Windows

### Instalación sin herramientas de compilación C++

A partir de la versión `better-sqlite3@12.9.0` (incluida en este proyecto),
existen **binarios precompilados para Electron 39 (ABI v140)** en todas las
plataformas, incluyendo Windows x64.  Esto significa que `pnpm install` ya
no requiere Visual Studio Build Tools ni Python.

```powershell
# PowerShell — sin flags adicionales
pnpm install
pnpm dev          # arranca la app y aplica migraciones automáticamente
```

El script `postinstall` detecta automáticamente la versión de Electron
instalada y descarga el binario correcto de GitHub Releases usando
`prebuild-install`.  **No es necesario compilar desde fuente.**

> **Nota:** la variable de entorno `PNPM_SKIP_POSTINSTALL` ya no es
> necesaria para desarrollo.  Sigue siendo respetada si la tenés seteada
> de una instalación anterior.

### Migraciones y seed en Windows (resolución de conflicto ABI)

`better-sqlite3` es un addon nativo que debe compilarse para el runtime que lo
cargará.  El `postinstall` lo compila para **Electron** (ABI v140).  Si intentás
correr las migraciones con Node.js directamente (`pnpm db:migrate`) y el binario
fue compilado para Electron, obtendrás un error `ERR_DLOPEN_FAILED`.

Para cada operación, elegí la variante que corresponda:

| Comando | Runtime | Cuándo usarlo |
|---------|---------|---------------|
| `pnpm db:migrate:node` | Node / tsx | Cuando `better-sqlite3` está compilado para Node (e.g. ambiente CI puro, sin Electron) |
| `pnpm db:migrate:electron` | Electron | Cuando `better-sqlite3` está compilado para Electron (flujo normal después de `pnpm install`) |
| `pnpm db:seed:node` | Node / tsx | Igual que `:node` arriba |
| `pnpm db:seed:electron` | Electron | Igual que `:electron` arriba |
| `pnpm db:migrate` | Node / tsx | Alias de `:node` — usar con cuidado en Windows si ya instalaste con Electron target |
| `pnpm db:seed` | Node / tsx | Ídem anterior |

**Flujo recomendado en Windows (después de `pnpm install`):**

```powershell
pnpm db:migrate:electron   # aplica migraciones con el binary de Electron
pnpm db:seed:electron      # carga datos iniciales con el binary de Electron
pnpm dev                   # inicia la app (también aplica migraciones al arrancar)
```

### Empaquetar la app en Windows (`pnpm package`)

Para generar el instalador `.exe` se puede usar el mismo flujo, ya que
`electron-builder` descargará los mismos binarios precompilados:

```powershell
pnpm package
```

Las migraciones SQL se incluyen automáticamente en el instalador como
`extraResources` (`resources/database/migrations/`), por lo que la app
empaquetada puede aplicar migraciones en producción sin necesitar acceso
al repositorio.

> Si por alguna razón querés compilar desde fuente (por ejemplo, para
> una arquitectura no soportada por los prebuilds), necesitarás
> **Visual Studio Build Tools 2022** con la carga de trabajo
> "Desarrollo de escritorio con C++" y **Python 3.x** en el `PATH`.

---

## 📁 Estructura del proyecto

```
Ventas-Stock/
├── electron/                    # Proceso principal (Node.js)
│   ├── main.ts                  # Entry point Electron
│   ├── preload.ts               # IPC bridge seguro (contextBridge)
│   ├── ipc/                     # Handlers IPC por módulo
│   └── modules/                 # Módulos de dominio
│       ├── auth/                # Autenticación y usuarios
│       ├── catalog/             # Catálogo de productos
│       ├── customers/           # Clientes
│       ├── suppliers/           # Proveedores
│       ├── stock/               # Control de stock
│       ├── sales/               # Ventas (end-to-end con AFIP)
│       ├── invoicing-afip/      # WSAA + WSFEv1 stubs y service
│       ├── printing/            # Generación de tickets y QR
│       ├── reporting/           # Reportes
│       └── backup/              # Respaldos de base de datos
├── database/
│   ├── db.ts                    # Singleton better-sqlite3
│   ├── migrate.ts               # Runner de migraciones
│   ├── seed.ts                  # Datos iniciales
│   └── migrations/              # Archivos SQL de migración
├── src/                         # Proceso renderer (React)
│   ├── main.tsx                 # Entry point React
│   ├── App.tsx                  # Router principal
│   ├── components/              # Layout y Sidebar
│   ├── pages/                   # Páginas por módulo
│   ├── lib/ipc.ts               # Helpers para IPC tipado
│   └── types/ipc.ts             # Tipos compartidos
├── scripts/
│   ├── migrate.ts               # CLI: pnpm db:migrate
│   └── seed.ts                  # CLI: pnpm db:seed
├── certs/                       # Certificados AFIP (no comitear)
└── .env.example                 # Variables de entorno de ejemplo
```

---

## 🔌 Módulos

### Auth
Gestión de usuarios y roles. Tres roles por defecto: `admin`, `vendedor`, `deposito`.
Contraseñas hasheadas con **scrypt** (N=16384, r=8, p=1) con salt aleatorio por usuario.

### Catálogo
Productos con SKU, código de barras, categoría, precio, costo y tasas de IVA AFIP (0%, 10.5%, 21%).

### Ventas (flujo end-to-end)
1. Agregar productos al carrito (búsqueda por nombre o escáner de código de barras)
2. Seleccionar cliente
3. Confirmar → `SaleService.createSale()`
4. Valida stock → persiste venta → llama AFIP (`InvoicingService.solicitarCAE()`)
5. **Si AFIP responde OK** → estado `AUTHORIZED`, se graba CAE y número de comprobante
6. **Si AFIP falla** → estado `INTERNAL_RECEIPT` (comprobante interno, sin validez fiscal)

### Facturación AFIP
- `wsaa.ts` — Stub con documentación completa para implementar WSAA real
- `wsfev1.ts` — Stub con estructura SOAP de `FECAESolicitar` documentada
- En homologación retorna un CAE mock para pruebas de flujo
- `InvoicingService` implementa retry automático (2 intentos) con backoff

### Stock
Movimientos de stock: `ENTRY`, `EXIT`, `ADJUSTMENT`, `SALE`, `PURCHASE_RETURN`.
Las ventas decrementan automáticamente el stock.

### Impresión / QR
- `qr-generator.ts` genera el QR AFIP (formato RG 4291/2018)
- `thermal-printer.ts` — stub con documentación ESC/POS
- `system-printer.ts` — impresión vía diálogo del sistema operativo (sin impresora térmica)

### Reportes
Resumen diario, top productos por revenue, stock bajo, movimientos de stock.

### Respaldos
Usa la API de backup nativa de SQLite (`db.backup(destPath)`).

---

## 🖨️ Impresión por sistema (sin impresora térmica)

La app incluye un modo de impresión que utiliza **cualquier impresora instalada en el sistema**
(láser, inkjet, PDF, etc.) hasta que el usuario cuente con una impresora térmica ESC/POS.

### Cómo funciona

1. El proceso principal (Electron) genera una plantilla HTML/CSS con formato de **ticket 80 mm**.
2. Carga la plantilla en una `BrowserWindow` oculta.
3. Llama a `webContents.print({ silent: false, printBackground: true })` para abrir el
   **diálogo de impresión nativo** del sistema operativo.
4. El usuario elige la impresora (o "Microsoft Print to PDF" en Windows) y confirma.

### Documentos soportados

| Documento | Cuándo aparece |
|-----------|---------------|
| **Factura** (Autorizada por AFIP) | Botón 🖨️ en Ventas → al finalizar una venta autorizada |
| **Remito Interno** | Botón 🖨️ en Ventas → al finalizar una venta no autorizada |
| **Factura / Remito** | Botón 🖨️ en la columna *Acciones* de Ventas y Facturación |

### Canales IPC involucrados

| Canal | Descripción |
|-------|-------------|
| `printing:printInvoiceSystem` | Imprime la factura de una venta como ticket 80 mm |
| `printing:printDeliveryNoteSystem` | Imprime el remito interno de una venta como ticket 80 mm |

### Compatibilidad

- ✅ Windows (incluye "Microsoft Print to PDF")
- ✅ macOS
- ✅ Linux (CUPS)
- No requiere impresora térmica ni drivers ESC/POS
- No rompe el flujo térmico existente (`printing:printSale`)

---

## ✅ AFIP Checklist

### 1. Alta de punto de venta para Web Services

1. Ingresar a [AFIP - Administrador de Relaciones](https://auth.afip.gob.ar/contribuyente_/login.xhtml)
2. Ir a: **Servicios Habilitados → Administración de puntos de venta y domicilios**
3. Crear o verificar el punto de venta (tipo: **CAE**)
4. Anotar el número de punto de venta → configurar en `.env` como `VITE_EMPRESA_PUNTO_VENTA`

### 2. Generación de certificados digitales

```bash
# Paso 1: Generar clave privada RSA 2048 bits
openssl genrsa -out certs/key.pem 2048

# Paso 2: Generar CSR (Certificate Signing Request)
openssl req -new -key certs/key.pem -out certs/cert.csr \
  -subj "/C=AR/O=Mi Empresa SRL/CN=Mi Empresa SRL/serialNumber=CUIT 20123456789"

# Paso 3: Subir el CSR al portal AFIP
# https://serviciosweb.afip.gob.ar/WSASS/WSASS_pro.aspx
# (Si es Monotributo: https://serviciosweb.afip.gob.ar/WSASS/)
# Seleccionar servicio: "wsfe" (Facturación Electrónica)
# Pegar contenido del archivo cert.csr
# Descargar el certificado y guardar como: certs/cert.pem

# Paso 4: Verificar el certificado
openssl x509 -in certs/cert.pem -text -noout | grep -E "Subject|Not After"
```

### 3. Homologación vs Producción

| Entorno | `AFIP_AMBIENTE` | WSAA | WSFEv1 |
|---------|----------------|------|--------|
| Testing | `homologacion` | wsaahomo.afip.gov.ar | wswhomo.afip.gov.ar |
| Producción | `produccion` | wsaa.afip.gov.ar | servicios1.afip.gov.ar |

> ⚠️ Los certificados de homologación se obtienen en el portal de testing de AFIP.
> Los de producción requieren el proceso completo con CUIT real.

### 4. Proceso para Monotributo

Los monotributistas emiten **Factura C** (tipo comprobante `11`).

Diferencias clave respecto a Responsable Inscripto:
- **No hay IVA desagregado** en el comprobante (`ImpIVA = 0`, `ImpNeto = ImpTotal`)
- Para consumidores finales con total < umbral (verificar RG vigente): `DocTipo=99`, `DocNro=0`
- Para montos mayores al umbral: identificar receptor con DNI/CUIT
- No se envían alícuotas de IVA en el request a AFIP

Para habilitar en producción:
1. Completar `certs/cert.pem` y `certs/key.pem`
2. Cambiar `AFIP_AMBIENTE=produccion` en `.env`
3. Implementar el llamado SOAP real en `electron/modules/invoicing-afip/wsaa.ts` y `wsfev1.ts`
   (ver comentarios con los pasos detallados en cada archivo)

---

## 🔄 Ejemplo end-to-end (flujo técnico)

```
NewSalePage.handleCheckout()
  → sales.create(input)                        [IPC: renderer → main]
    → SaleService.createSale(input)
      → StockService.validateAvailability()    [verifica stock]
      → SaleRepository.create()               [persiste venta PENDING_CAE]
      → StockService.registerSaleExit()       [decrementa stock]
      → InvoicingService.solicitarCAE(sale)
          → getTicketAcceso()                 [WSAA: obtiene TA]
          → solicitarCAE(request)             [WSFEv1: FECAESolicitar]
          → Si OK: SaleRepository.updateStatus(AUTHORIZED + CAE)
          → Si error: SaleRepository.updateStatus(INTERNAL_RECEIPT)
      → return sale (con estado y CAE)
  → Renderer muestra resultado al usuario
```

---

## 📜 Scripts

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Inicia Electron en modo desarrollo (aplica migraciones al arrancar) |
| `pnpm build` | Compila para producción |
| `pnpm lint` | ESLint (TypeScript + React) |
| `pnpm format` | Prettier |
| `pnpm db:migrate` | Aplica migraciones SQL pendientes (Node/tsx) |
| `pnpm db:migrate:node` | Ídem — explícitamente con Node/tsx runtime |
| `pnpm db:migrate:electron` | Aplica migraciones usando el runtime Electron (recomendado en Windows) |
| `pnpm db:seed` | Carga datos iniciales (admin + productos) (Node/tsx) |
| `pnpm db:seed:node` | Ídem — explícitamente con Node/tsx runtime |
| `pnpm db:seed:electron` | Carga datos iniciales usando el runtime Electron (recomendado en Windows) |
| `pnpm typecheck` | Verifica tipos TypeScript sin compilar |
| `pnpm package` | Build + empaqueta instalador |

---

## 🔐 Seguridad

- Los certificados AFIP **nunca deben commitearse** (están en `.gitignore`)
- Usar variables de entorno para rutas y credenciales
- El preload usa `contextBridge` (no `nodeIntegration`)
- CSP habilitada en el HTML del renderer

---

## 📄 Licencia

MIT