/**
 * Plantillas del mail 2 del pedido web (listo para retirar / despachado).
 * Sin dependencias de Electron, para poder previsualizarlas fuera de la app.
 * El mail 1 vive en hostinger/api/order-emails.php: mantener el mismo estilo.
 */

export type NotifyKind = 'ready' | 'shipped'

export const WEB_ORDERS_BCC = 'ventas@pandorabox-juegosdeingenio.com.ar'
const STORE_ADDRESS = 'San Blas 2890, CABA'
const STORE_HOURS = 'Lunes a viernes de 10 a 13 y de 16 a 20 · Sábados de 10 a 13'
const STORE_WHATSAPP = '11 6008-2033'
const STORE_WHATSAPP_LINK = 'https://wa.me/5491160082033'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Mismo número de pedido corto que muestra el mail de confirmación (order-emails.php). */
export function shortOrderRef(externalId: string): string {
  return externalId.slice(0, 8).toUpperCase()
}

export function buildNotifyHtml(
  kind: NotifyKind,
  d: { customerName: string; ref: string; address: string; note: string }
): string {
  const firstName = d.customerName.trim().split(/\s+/)[0] ?? ''
  const hello = `¡Hola${firstName ? ', ' + esc(firstName) : ''}!`
  const noteBlock = d.note
    ? `<p style="margin:12px 0 0">${esc(d.note).replace(/\n/g, '<br>')}</p>`
    : ''

  const main = kind === 'ready'
    ? `<p style="margin:0 0 12px">Tu pedido <strong>#${esc(d.ref)}</strong> ya está <strong>listo para retirar</strong>.</p>
       <div style="padding:14px;background:#f7f5fb;border-radius:8px;line-height:1.5">
         <p style="margin:0 0 6px"><strong>🏪 ${STORE_ADDRESS}</strong></p>
         <p style="margin:0 0 6px">${STORE_HOURS}</p>
         <p style="margin:0">Al retirar, mencioná el número de pedido o el nombre de quien hizo la compra.</p>
         ${noteBlock}
       </div>`
    : `<p style="margin:0 0 12px">Ya despachamos tu pedido <strong>#${esc(d.ref)}</strong>.</p>
       <div style="padding:14px;background:#f7f5fb;border-radius:8px;line-height:1.5">
         <p style="margin:0 0 6px"><strong>🚚 Envío a domicilio</strong></p>
         <p style="margin:0">${esc(d.address)}</p>
         ${noteBlock}
       </div>`

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#222">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border-radius:10px;padding:24px;font-size:14px">
  <h2 style="margin:0 0 12px;color:#3b2a5c">${hello}</h2>
  ${main}
  <p style="margin:16px 0 0">Te adjuntamos la factura de tu compra.</p>
  <p style="margin:16px 0 0;line-height:1.5">¿Alguna consulta? Respondé este mail o escribinos por WhatsApp al
    <a href="${STORE_WHATSAPP_LINK}" style="color:#3b2a5c">${STORE_WHATSAPP}</a>.</p>
</div>
<p style="text-align:center;font-size:12px;color:#888;margin:14px 0 0">Pandora Box - Juegos de Ingenio · ${STORE_ADDRESS}</p>
</div></body></html>`
}
