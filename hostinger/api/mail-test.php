<?php
/**
 * mail-test.php — Diagnóstico del envío de mails desde el servidor
 *
 * GET con header X-Api-Key (la misma SYNC_API_KEY de la app). Manda a la
 * casilla de ventas (MAIL_BCC) los dos modelos del mail "Recibimos tu compra"
 * con un pedido de ejemplo, y devuelve si salieron o el error de SMTP.
 * No toca pedidos reales ni la base.
 *
 * Subir a: public_html/pandorabox/api/mail-test.php
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/order-emails.php';

header('Content-Type: application/json; charset=utf-8');
validateApiKey();

$items = [
    ['product_name' => 'Juego de ejemplo', 'quantity' => 1, 'unit_price' => 25000],
    ['product_name' => 'Rompecabezas de ejemplo', 'quantity' => 2, 'unit_price' => 8500],
];
$base = [
    'external_id' => 'prueba00-0000-4000-8000-000000000000',
    'customer_name' => 'Cliente Prueba',
    'surcharge_amount' => 0, 'surcharge_pct' => 0,
];
$pickup = $base + ['delivery_type' => 'pickup', 'delivery_address' => '', 'shipping_amount' => 0, 'total' => 42000];
$ship   = $base + ['delivery_type' => 'shipping', 'delivery_address' => 'Av. de Ejemplo 1234, CABA', 'shipping_amount' => 3000, 'total' => 45000];

$to = MAIL_BCC;
echo json_encode([
    'to'       => $to,
    'pickup'   => sendMail($to, '[PRUEBA] Recibimos tu compra en Pandora Box (retiro)', buildOrderConfirmationHtml($pickup, $items)) ?? 'ok',
    'shipping' => sendMail($to, '[PRUEBA] Recibimos tu compra en Pandora Box (envío)', buildOrderConfirmationHtml($ship, $items)) ?? 'ok',
], JSON_UNESCAPED_UNICODE);
