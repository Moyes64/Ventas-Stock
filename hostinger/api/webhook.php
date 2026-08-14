<?php
/**
 * webhook.php — Receptor de notificaciones de MercadoPago
 *
 * MP llama a este endpoint cuando ocurre un evento de pago.
 * Verificamos el pago consultando la API de MP y actualizamos la orden.
 *
 * Subir a: public_html/pandorabox/api/webhook.php
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/telegram.php';

header('Content-Type: application/json; charset=utf-8');

// MP envía GET con ?topic=payment&id=xxx (IPN) o POST con JSON (Webhooks v2)
$body = json_decode(file_get_contents('php://input'), true) ?? [];

$topic   = $_GET['topic'] ?? ($body['type'] ?? '');
$eventId = $_GET['id']    ?? ($body['data']['id'] ?? null);

// Solo nos interesan eventos de pago
if ($topic !== 'payment' || !$eventId) {
    http_response_code(200);
    echo json_encode(['ok' => true, 'skipped' => true]);
    exit;
}

// Ver M3 de la auditoría — con MP_WEBHOOK_SECRET configurada, rechaza
// notificaciones con firma inválida antes de gastar una consulta contra la
// API de MP.
if (!isValidMpWebhookSignature((string)($_GET['data.id'] ?? $eventId))) {
    error_log("[webhook] Firma inválida para eventId={$eventId} — rechazada");
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Invalid signature']);
    exit;
}

try {
    // ── Consultar el pago en MP ───────────────────────────────────────────
    $ch = curl_init("https://api.mercadopago.com/v1/payments/{$eventId}");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . MP_ACCESS_TOKEN],
        CURLOPT_TIMEOUT        => 15,
    ]);
    $response  = curl_exec($ch);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) throw new Exception('cURL error: ' . $curlError);

    $payment = json_decode($response, true);
    if (empty($payment['id'])) throw new Exception('Invalid MP response');

    $mpStatus        = $payment['status']             ?? '';          // approved / pending / rejected
    $externalRef     = $payment['external_reference'] ?? '';
    $mpPaymentId     = (string)$payment['id'];
    $mpPaymentMethod = $payment['payment_type_id']    ?? 'mercadopago';

    if (empty($externalRef)) {
        http_response_code(200);
        echo json_encode(['ok' => true, 'skipped' => 'no external_reference']);
        exit;
    }

    initSchema();
    $pdo = getConnection();

    // Buscar la orden por external_id
    $order = $pdo->prepare("SELECT id, status FROM web_orders WHERE external_id=?");
    $order->execute([$externalRef]);
    $row = $order->fetch();

    if (!$row) {
        http_response_code(200);
        echo json_encode(['ok' => true, 'skipped' => 'order not found']);
        exit;
    }

    // MercadoPago puede reenviar la misma notificación varias veces (comportamiento
    // esperado de su lado). Si la orden ya llegó a un estado terminal (ya la bajó
    // Electron o ya fue cancelada), no la volvemos a exponer como 'paid': eso haría
    // que se vuelva a descargar y se duplique la venta y el descuento de stock.
    $terminalStates = ['processed', 'cancelled'];
    if (in_array($row['status'], $terminalStates, true)) {
        http_response_code(200);
        echo json_encode(['ok' => true, 'skipped' => 'order already in terminal state: ' . $row['status']]);
        exit;
    }

    // Mapear estado MP → estado interno
    $newStatus = match($mpStatus) {
        'approved'    => 'paid',
        'in_process',
        'pending'     => 'pending_payment',
        'rejected',
        'cancelled'   => 'cancelled',
        default       => $row['status'],
    };

    // Actualizar solo si cambia el estado o se agrega el payment_id
    $pdo->prepare("
        UPDATE web_orders
        SET status=?, mp_payment_id=?, payment_method=?
        WHERE external_id=?
    ")->execute([$newStatus, $mpPaymentId, $mpPaymentMethod, $externalRef]);

    // Notificación Telegram cuando se aprueba el pago
    if ($newStatus === 'paid' && $row['status'] !== 'paid') {
        $orderDetail = $pdo->prepare("
            SELECT o.customer_name, o.customer_phone, o.delivery_type, o.total,
                   GROUP_CONCAT(oi.quantity || 'x ' || oi.product_name SEPARATOR ', ') AS items
            FROM web_orders o
            JOIN web_order_items oi ON oi.order_id = o.id
            WHERE o.external_id = ?
            GROUP BY o.id
        ");
        $orderDetail->execute([$externalRef]);
        $od = $orderDetail->fetch();
        if ($od) {
            // Estos tres campos los completa quien compra en el checkout — el
            // mensaje se manda con parse_mode HTML, así que sin escapar acá
            // alguien podría meter <a href="...">, romper el formato del
            // mensaje, o directamente que Telegram lo rechace y te pierdas el
            // aviso de una venta real. Ver hallazgo A3.
            $safeCustomerName  = htmlspecialchars($od['customer_name']  ?? '', ENT_QUOTES);
            $safeCustomerPhone = htmlspecialchars($od['customer_phone'] ?? '', ENT_QUOTES);
            $safeItems         = htmlspecialchars($od['items']          ?? '', ENT_QUOTES);

            $delivery = $od['delivery_type'] === 'shipping' ? '🚚 Envío a domicilio' : '🏪 Retira en local';
            $msg = "🛒 <b>Nueva venta Pandora Box</b>\n\n"
                 . "👤 <b>Cliente:</b> {$safeCustomerName}\n"
                 . "📱 <b>Tel:</b> {$safeCustomerPhone}\n"
                 . "📦 <b>Productos:</b> {$safeItems}\n"
                 . "💰 <b>Total:</b> $" . number_format((float)$od['total'], 2, ',', '.') . "\n"
                 . "🚀 <b>Entrega:</b> {$delivery}\n"
                 . "🔖 <b>Ref:</b> {$externalRef}";
            telegramNotify($msg);
        }
    }

    error_log("[webhook] order={$externalRef} mp_status={$mpStatus} new_status={$newStatus}");

    http_response_code(200);
    echo json_encode(['ok' => true, 'status' => $newStatus]);

} catch (Exception $e) {
    // MP reintenta si recibe != 200, así que siempre devolvemos 200. El detalle
    // real va solo al log — este endpoint es alcanzable sin autenticación, así
    // que la respuesta no debería filtrar mensajes de PDO/SQL (ver M5).
    error_log('[webhook] Error: ' . $e->getMessage());
    http_response_code(200);
    echo json_encode(['ok' => false, 'error' => 'internal_error']);
}
