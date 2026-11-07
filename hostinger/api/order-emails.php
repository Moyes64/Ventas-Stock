<?php
/**
 * order-emails.php — Mail "Recibimos tu compra" al cliente de la tienda web
 * Incluir con require_once desde webhook.php.
 * Subir a: public_html/pandorabox/api/order-emails.php
 *
 * Es el primero de los mails propios del circuito (el comprobante de pago lo
 * manda Mercado Pago). Sale una sola vez por pedido, cuando el pago queda
 * aprobado. Los mails siguientes (listo para retirar / despachado, con la
 * factura) los manda la app desde Órdenes Web.
 */

require_once __DIR__ . '/mailer.php';

const STORE_ADDRESS  = 'San Blas 2890, CABA';
const STORE_HOURS    = 'Lunes a viernes de 10 a 13 y de 16 a 20 · Sábados de 10 a 13';
const STORE_WHATSAPP = '11 6008-2033';
const STORE_WHATSAPP_LINK = 'https://wa.me/5491160082033';

function orderEmailMoney(float $n): string {
    return '$ ' . number_format($n, 2, ',', '.');
}

/**
 * Manda el mail de confirmación si todavía no salió. Se "reserva" el envío con
 * un UPDATE condicional antes de mandar: MP reenvía la misma notificación
 * varias veces y dos webhooks casi simultáneos no deben mandar dos mails.
 * Si el envío falla se libera la reserva, así un reenvío posterior lo reintenta.
 */
function sendOrderConfirmationEmail(PDO $pdo, string $externalRef): void {
    $claim = $pdo->prepare("
        UPDATE web_orders SET confirmation_email_sent_at=?, confirmation_email_error=NULL
        WHERE external_id=? AND confirmation_email_sent_at IS NULL
    ");
    $claim->execute([argentinaNow(), $externalRef]);
    if ($claim->rowCount() !== 1) return; // ya se mandó (o se está mandando)

    $error = null;
    try {
        $o = $pdo->prepare("SELECT * FROM web_orders WHERE external_id=?");
        $o->execute([$externalRef]);
        $order = $o->fetch();
        $it = $pdo->prepare("
            SELECT oi.product_name, oi.quantity, oi.unit_price
            FROM web_order_items oi JOIN web_orders o ON o.id = oi.order_id
            WHERE o.external_id=? ORDER BY oi.id
        ");
        $it->execute([$externalRef]);
        $items = $it->fetchAll();

        if (!$order || empty($order['customer_email'])) {
            $error = 'El pedido no tiene email del cliente';
        } else {
            $error = sendMail(
                $order['customer_email'],
                'Recibimos tu compra en Pandora Box',
                buildOrderConfirmationHtml($order, $items)
            );
        }
    } catch (Exception $e) {
        $error = $e->getMessage();
    }

    if ($error !== null) {
        error_log("[order-email] FALLÓ confirmación order={$externalRef}: {$error}");
        $pdo->prepare("UPDATE web_orders SET confirmation_email_sent_at=NULL, confirmation_email_error=? WHERE external_id=?")
            ->execute([mb_substr($error, 0, 500), $externalRef]);
    } else {
        error_log("[order-email] confirmación enviada order={$externalRef}");
    }
}

function buildOrderConfirmationHtml(array $order, array $items): string {
    $h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $firstName = trim(explode(' ', trim((string)$order['customer_name']))[0] ?? '');
    $ref = strtoupper(substr((string)$order['external_id'], 0, 8));

    $rows = '';
    foreach ($items as $i) {
        $sub = (float)$i['unit_price'] * (int)$i['quantity'];
        $rows .= '<tr>'
            . '<td style="padding:6px 0">' . (int)$i['quantity'] . ' × ' . $h($i['product_name']) . '</td>'
            . '<td style="padding:6px 0;text-align:right;white-space:nowrap">' . orderEmailMoney($sub) . '</td>'
            . '</tr>';
    }
    $shipping  = (float)($order['shipping_amount'] ?? 0);
    $surcharge = (float)($order['surcharge_amount'] ?? 0);
    if ($shipping > 0) {
        $rows .= '<tr><td style="padding:6px 0;color:#555">Envío a domicilio</td>'
               . '<td style="padding:6px 0;text-align:right">' . orderEmailMoney($shipping) . '</td></tr>';
    }
    if ($surcharge > 0) {
        $pct = rtrim(rtrim(number_format((float)$order['surcharge_pct'], 2, ',', ''), '0'), ',');
        $rows .= '<tr><td style="padding:6px 0;color:#555">Recargo tarjeta de crédito (' . $pct . '%)</td>'
               . '<td style="padding:6px 0;text-align:right">' . orderEmailMoney($surcharge) . '</td></tr>';
    }

    if ($order['delivery_type'] === 'shipping') {
        $delivery = '<p style="margin:0 0 6px"><strong>🚚 Envío a domicilio</strong></p>'
            . '<p style="margin:0 0 6px">' . $h($order['delivery_address']) . '</p>'
            . '<p style="margin:0">Estamos preparando tu pedido. Te vamos a contactar para coordinar la entrega '
            . 'y te avisamos por mail cuando lo despachemos.</p>';
    } else {
        $delivery = '<p style="margin:0 0 6px"><strong>🏪 Retiro en el local</strong></p>'
            . '<p style="margin:0 0 6px">Estamos preparando tu pedido. <strong>Te avisamos por mail cuando esté listo '
            . 'para retirar</strong>: por favor no te acerques antes de recibir ese aviso.</p>'
            . '<p style="margin:0">' . STORE_ADDRESS . '<br>' . STORE_HOURS . '</p>';
    }

    return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        . '<body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#222">'
        . '<div style="max-width:560px;margin:0 auto;padding:24px 16px">'
        . '<div style="background:#fff;border-radius:10px;padding:24px">'
        . '<h2 style="margin:0 0 4px;color:#3b2a5c">¡Gracias por tu compra' . ($firstName ? ', ' . $h($firstName) : '') . '!</h2>'
        . '<p style="margin:0 0 16px;color:#555">Tu pago fue aprobado. Pedido <strong>#' . $h($ref) . '</strong></p>'
        . '<table style="width:100%;border-collapse:collapse;font-size:14px">' . $rows
        . '<tr><td style="padding:10px 0 0;border-top:1px solid #ddd"><strong>Total</strong></td>'
        . '<td style="padding:10px 0 0;border-top:1px solid #ddd;text-align:right"><strong>' . orderEmailMoney((float)$order['total']) . '</strong></td></tr>'
        . '</table>'
        . '<div style="margin:20px 0 0;padding:14px;background:#f7f5fb;border-radius:8px;font-size:14px;line-height:1.5">' . $delivery . '</div>'
        . '<p style="margin:20px 0 0;font-size:14px;line-height:1.5">¿Alguna consulta? Respondé este mail o escribinos por WhatsApp al '
        . '<a href="' . STORE_WHATSAPP_LINK . '" style="color:#3b2a5c">' . STORE_WHATSAPP . '</a>.</p>'
        . '</div>'
        . '<p style="text-align:center;font-size:12px;color:#888;margin:14px 0 0">Pandora Box - Juegos de Ingenio · ' . STORE_ADDRESS . '</p>'
        . '</div></body></html>';
}
