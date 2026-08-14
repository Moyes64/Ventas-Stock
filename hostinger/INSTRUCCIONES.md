# Instrucciones de Deploy en Hostinger

## Archivos a subir

Subir toda la carpeta `hostinger/` a tu hosting. La estructura en el servidor debe quedar:

```
public_html/
└── pandorabox/
    ├── .htaccess
    ├── api/
    │   ├── db.php
    │   ├── config.local.php       (no versionado — ver Paso 2)
    │   ├── sync.php
    │   ├── orders.php
    │   ├── webhook.php
    │   ├── telegram.php
    │   ├── categories.php
    │   ├── products.php
    │   ├── params.php
    │   └── upload-image.php
    ├── dashboard/
    │   ├── index.php
    │   └── style.css
    └── images/
        └── .htaccess               (se crea products/ solo al subir la primera imagen)
```

## Paso 1 — Crear base de datos MySQL en Hostinger

1. Ir al panel de Hostinger → **Bases de datos MySQL**
2. Crear una nueva base de datos (ej: `u123456789_ventasstock`)
3. Crear un usuario con contraseña y asignarlo a esa BD con todos los permisos
4. Anotar: host, nombre de BD, usuario y contraseña

Las credenciales reales de este deploy NO están en este documento — viven en
`api/config.local.php` (no versionado). Si necesitás consultarlas o rotarlas,
abrí ese archivo directamente.

## Paso 2 — Configurar credenciales

Todas las credenciales (BD, API key de sync, token de Mercado Pago, password
del dashboard) se configuran en un único archivo **que no se versiona**:
`api/config.local.php`.

1. Copiá `api/config.local.example.php` como `api/config.local.php`.
2. Completá cada valor real (ver plantilla, tiene comentarios de qué va en cada uno).
3. Elegí una `SYNC_API_KEY` fuerte (mínimo 20 caracteres, aleatoria) y una
   `DASHBOARD_PASSWORD` para el acceso desde el celular.
4. Subí `config.local.php` al hosting junto con el resto de `api/` (no lo excluyas
   del FTP — solo del control de versiones/de cualquier zip que compartas).

`db.php` corta la ejecución con un error claro si falta alguna de estas
variables, así que si algo no está configurado se nota enseguida en vez de
fallar en silencio.

## Paso 3 — Subir archivos al hosting

Usar el **File Manager** de Hostinger o FTP (FileZilla):
- Host FTP: tu dominio
- Usuario/contraseña: los del panel de Hostinger

Subir toda la carpeta dentro de `public_html/pandorabox/` (ver estructura completa en "Archivos a subir" más arriba — son bastantes más de 4 archivos hoy).

## Paso 4 — Verificar que funcione el endpoint

Abrir en el navegador: `https://tudominio.com/pandorabox/api/sync.php`
Debe devolver: `{"error":"Method not allowed"}` (eso es correcto, significa que está funcionando)

## Paso 5 — Configurar la aplicación Ventas-Stock

En la app de escritorio, ir a **Sync Web** en el menú lateral y completar:

- **URL del endpoint**: `https://tudominio.com/pandorabox/api/sync.php`
- **API Key**: la misma clave que pusiste en `SYNC_API_KEY` dentro de `api/config.local.php`
- **Intervalo**: cada cuántos minutos sincronizar (recomendado: 15)
- Activar la sincronización y hacer click en **Guardar configuración**
- Probar con **Sincronizar ahora**

## Paso 6 — Acceder al dashboard

Desde el celular o cualquier navegador:
`https://tudominio.com/pandorabox/dashboard/`

Ingresar la contraseña definida en `DASHBOARD_PASSWORD`.

## Seguridad

- Nunca compartas la API Key ni la contraseña del dashboard
- Considera agregar HTTPS (Hostinger lo incluye gratis con Let's Encrypt)
- La tabla `sync_snapshots` guarda solo los últimos 100 snapshots automáticamente

## Estructura del payload sincronizado

```json
{
  "timestamp": "2026-06-08T10:30:00.000Z",
  "empresa": "PANDORA",
  "stock": [
    { "id": 1, "name": "Producto X", "sku": "SKU001", "currentStock": 50, "stockMin": 5, "isLow": false }
  ],
  "ventasHoy": {
    "count": 12,
    "total": 45800.00,
    "byPaymentMethod": { "contado_efectivo": 20000, "transferencia": 25800, "debito": 0, "credito": 0 },
    "recentSales": [...]
  },
  "caja": {
    "status": "open",
    "sessionDate": "2026-06-08",
    "aperturaAmount": 5000,
    "efectivoVentas": 20000,
    "ingresosTotal": 0,
    "egresosTotal": 500,
    "expectedTotal": 24500
  }
}
```
