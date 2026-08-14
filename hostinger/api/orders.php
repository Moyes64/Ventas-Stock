<?php
/**
 * orders.php — Gestión de órdenes de la tienda web
 *
 * GET  /api/orders/pending        → Electron descarga órdenes pagadas sin procesar
 * POST /api/orders                → Next.js crea orden + preferencia MercadoPago
 *                                    body.paymentChannel: 'credit_card' | 'other' (default 'other')
 *                                    Si es 'credit_card' se aplica el recargo configurado en
 *                                    Ventas-Stock (param 'recargoTarjetaCreditoWeb') y la
 *                                    preferencia de MP queda restringida a solo tarjeta de
 *                                    crédito; si es 'other', se excluye credit_card de la
 *                                    preferencia para que no se pueda pagar sin el recargo.
 * PATCH /api/orders/{id}/status   → Electron marca orden como procesada
 *
 * El router (.htaccess) mapea:
 *   /api/orders/pending      → orders.php?action=pending
 *   /api/orders/{id}/status  → orders.php?action=status&id={id}
 *   POST /api/orders         → orders.php (sin acción)
 *
 * Subir a: public_html/pandorabox/api/orders.php
 */

require_once __DIR__ . '/db.php';

// Restringido (no '*'): este archivo incluye POST /api/orders, el único
// endpoint de escritura sin API key — no queremos que cualquier página de
// internet pueda dispararlo silenciosamente desde el navegador de un
// visitante. Ver corsHeadersRestricted() en db.php.
corsHeadersRestricted('GET, POST, PATCH, OPTIONS');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;
$orderId = $_GET['id'] ?? null;

// ── GET /api/orders/pending — para Electron ──────────────────────────────
if ($method === 'GET' && $action === 'pending') {
    validateApiKey();
    try {
        initSchema();
        $pdo = getConnection();

        $stmt = $pdo->query("
            SELECT o.*, GROUP_CONCAT(
                JSON_OBJECT(
                    'productId', oi.product_id,
                    'productName', oi.product_name,
                    'quantity', oi.quantity,
                    'unitPrice', oi.unit_price
                )
            ) AS items_json
            FROM web_orders o
            JOIN web_order_items oi ON oi.order_id = o.id
            WHERE o.status = 'paid'
            GROUP BY o.id
            ORDER BY o.created_at ASC
        ");

        $orders = [];
        foreach ($stmt->fetchAll() as $row) {
            $items = array_map(function($i) {
                return [
                    'productId'   => (int)$i['productId'],
                    'productName' => $i['productName'],
                    'quantity'    => (int)$i['quantity'],
                    'unitPrice'   => (float)$i['unitPrice'],
                ];
            }, json_decode('[' . $row['items_json'] . ']', true) ?: []);

            $orders[] = [
                'id'                => (int)$row['id'],
                'externalId'        => $row['external_id'],
                'customerName'      => $row['customer_name'],
                'customerEmail'     => $row['customer_email'],
                'customerPhone'     => $row['customer_phone'],
                'customerDocType'   => $row['customer_doc_type'],
                'customerDocNumber' => $row['customer_doc_number'],
                'deliveryType'      => $row['delivery_type'],
                'deliveryAddress'   => $row['delivery_address'],
                'total'           => (float)$row['total'],
                'shippingAmount'  => (float)($row['shipping_amount'] ?? 0),
                'surchargeAmount' => (float)($row['surcharge_amount'] ?? 0),
                'surchargePct'    => (float)($row['surcharge_pct'] ?? 0),
                'paymentMethod'   => $row['payment_method'],
                'mpPaymentId'     => $row['mp_payment_id'],
                'items'           => $items,
                // created_at de MySQL es un DATETIME sin timezone (asumido UTC, igual
                // que el reloj del servidor). Se manda como ISO 8601 con 'Z' explícito
                // para que el cliente (Electron) lo interprete sin ambigüedad y lo
                // convierta a fecha/hora local de Argentina — ver utcToLocalDate().
                'createdAt'       => str_replace(' ', 'T', $row['created_at']) . 'Z',
            ];
        }
        echo json_encode($orders);

    } catch (Exception $e) {
        apiError($e);
    }
    exit;
}

// ── PATCH /api/orders/{id}/status — Electron marca como procesada ─────────
if ($method === 'PATCH' && $action === 'status' && $orderId !== null) {
    validateApiKey();
    $body = json_decode(file_get_contents('php://input'), true);
    $newStatus = $body['status'] ?? 'processed';

    $allowed = ['processed', 'cancelled'];
    if (!in_array($newStatus, $allowed, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid status']);
        exit;
    }

    try {
        initSchema();
        $pdo = getConnection();
        $stmt = $pdo->prepare("UPDATE web_orders SET status=? WHERE external_id=?");
        $stmt->execute([$newStatus === 'processed' ? 'processed' : 'cancelled', $orderId]);
        echo json_encode(['ok' => true]);
    } catch (Exception $e) {
        apiError($e);
    }
    exit;
}

// ── POST /api/orders — Next.js crea la orden + preferencia MP ────────────
if ($method === 'POST' && $action === null) {
    // initSchema() antes que nada: isOrderCreationRateLimited()/recordOrderCreationAttempt()
    // necesitan que order_creation_attempts ya exista, y este endpoint puede
    // ser el primero en pegarle a la API en un deploy nuevo (antes de que
    // sync.php haya corrido ni una vez).
    try { initSchema(); } catch (Exception $e) {
        apiError($e);
        exit;
    }

    // Rate limit por IP (A1): sin esto, un script fuera del navegador —a
    // quien no le importa CORS— podía generar órdenes y preferencias de MP
    // en cadena sin ningún freno. Se cuenta el intento apenas se entra acá,
    // antes de validar el body, para que ni siquiera requests basura sirvan
    // para esquivar el límite reintentando.
    $clientIp = clientIp();
    if (isOrderCreationRateLimited($clientIp)) {
        http_response_code(429);
        echo json_encode(['error' => 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.']);
        exit;
    }
    recordOrderCreationAttempt($clientIp);

    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body) || empty($body['items'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid order data']);
        exit;
    }

    try {
        initSchema();
        $pdo = getConnection();

        $externalId = uniqid('PB', true);

        // Costo de envío configurado desde Ventas-Stock
        $shippingCost = 0.0;
        if (($body['deliveryType'] ?? 'pickup') === 'shipping') {
            $stmtParam = $pdo->prepare("SELECT param_value FROM web_params WHERE param_key='costoEnvioWeb'");
            $stmtParam->execute();
            $paramRow = $stmtParam->fetch();
            $shippingCost = $paramRow ? (float)$paramRow['param_value'] : 0.0;
        }

        // El cliente elige el canal de pago ANTES de ir a MercadoPago (ver frontend).
        // 'credit_card' = tarjeta de crédito con recargo; cualquier otro valor = sin recargo.
        // El % de recargo NUNCA se toma del cliente: siempre se lee del servidor
        // (configurado desde Ventas-Stock) para que no pueda manipularse desde el front.
        //
        // Si el body no manda 'paymentChannel' (frontend viejo, todavía no migrado a la
        // selección de medio de pago en el carrito) no se aplica recargo ni restricción:
        // así este endpoint se puede desplegar antes que el frontend sin cortar pagos.
        $paymentChannelSent = array_key_exists('paymentChannel', $body);
        $paymentChannel = $paymentChannelSent && $body['paymentChannel'] === 'credit_card' ? 'credit_card' : 'other';

        $surchargePct = 0.0;
        if ($paymentChannel === 'credit_card') {
            $stmtSurcharge = $pdo->prepare("SELECT param_value FROM web_params WHERE param_key='recargoTarjetaCreditoWeb'");
            $stmtSurcharge->execute();
            $surchargeRow = $stmtSurcharge->fetch();
            $surchargePct = $surchargeRow ? (float)$surchargeRow['param_value'] : 0.0;
        }

        $subtotal = array_reduce($body['items'], function($sum, $item) {
            return $sum + ($item['quantity'] * $item['unitPrice']);
        }, 0.0) + $shippingCost;

        $surchargeAmount = $surchargePct > 0 ? round($subtotal * $surchargePct / 100, 2) : 0.0;
        $total = $subtotal + $surchargeAmount;

        $pdo->beginTransaction();

        $pdo->prepare("
            INSERT INTO web_orders
                (external_id, customer_name, customer_email, customer_phone,
                 customer_doc_type, customer_doc_number,
                 delivery_type, delivery_address, total,
                 shipping_amount, surcharge_amount, surcharge_pct,
                 payment_method, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'mercadopago','pending_payment')
        ")->execute([
            $externalId,
            $body['customerName']      ?? '',
            $body['customerEmail']     ?? '',
            $body['customerPhone']     ?? '',
            $body['customerDocType']   ?? null,
            $body['customerDocNumber'] ?? null,
            $body['deliveryType']      ?? 'pickup',
            $body['deliveryAddress']   ?? '',
            $total,
            $shippingCost,
            $surchargeAmount,
            $surchargePct,
        ]);
        $orderId = (int)$pdo->lastInsertId();

        $stmtItem = $pdo->prepare("
            INSERT INTO web_order_items (order_id, product_id, product_name, quantity, unit_price)
            VALUES (?,?,?,?,?)
        ");
        foreach ($body['items'] as $item) {
            $stmtItem->execute([
                $orderId,
                (int)$item['productId'],
                $item['productName'] ?? '',
                (int)$item['quantity'],
                (float)$item['unitPrice'],
            ]);
        }

        $pdo->commit();

        // ── Crear preferencia en MercadoPago ──────────────────────────────
        $mpItems = array_map(fn($item) => [
            'id'          => (string)($item['productId'] ?? 0),
            'title'       => $item['productName'] ?? 'Producto',
            'quantity'    => (int)$item['quantity'],
            'unit_price'  => (float)$item['unitPrice'],
            'currency_id' => 'ARS',
        ], $body['items']);

        if ($shippingCost > 0) {
            $mpItems[] = [
                'id'          => 'envio',
                'title'       => 'Envío a domicilio (CABA)',
                'quantity'    => 1,
                'unit_price'  => $shippingCost,
                'currency_id' => 'ARS',
            ];
        }

        if ($surchargeAmount > 0) {
            $mpItems[] = [
                'id'          => 'recargo-credito',
                'title'       => "Recargo tarjeta de crédito ({$surchargePct}%)",
                'quantity'    => 1,
                'unit_price'  => $surchargeAmount,
                'currency_id' => 'ARS',
            ];
        }

        // Todos los payment_types de MercadoPago excluibles (Checkout Pro no soporta
        // "incluir solo uno": hay que excluir todos los demás). 'account_money' (saldo
        // en cuenta de MercadoPago) queda afuera de esta lista a propósito: la API de MP
        // rechaza la preferencia con error "account_money cannot be excluded", así que
        // ese medio queda siempre disponible aunque el cliente haya elegido tarjeta de
        // crédito con recargo. Es una limitación de MercadoPago, no algo que podamos evitar.
        $allPaymentTypes = ['credit_card', 'debit_card', 'prepaid_card', 'ticket', 'atm', 'digital_wallet', 'bank_transfer'];

        // El precio mostrado en el carrito ya asume un medio de pago concreto (con o sin
        // recargo), así que la preferencia de MP se restringe al mismo canal: si dejáramos
        // elegir libremente en MP, el cliente podría pagar con tarjeta de crédito al precio
        // sin recargo (o pagar de más si eligió crédito y después usa débito).
        if (!$paymentChannelSent) {
            $excludedTypes = [];
        } elseif ($paymentChannel === 'credit_card') {
            $excludedTypes = array_values(array_diff($allPaymentTypes, ['credit_card']));
        } else {
            $excludedTypes = ['credit_card'];
        }

        $preference = [
            'items'              => $mpItems,
            'payer'              => [
                'name'  => $body['customerName']  ?? '',
                'email' => $body['customerEmail'] ?? '',
                'phone' => ['number' => $body['customerPhone'] ?? ''],
            ],
            'payment_methods'    => [
                'excluded_payment_types' => array_map(fn($id) => ['id' => $id], $excludedTypes),
            ],
            'back_urls'          => [
                'success' => SITE_URL . '/pago/exitoso?ref=' . $externalId,
                'failure' => SITE_URL . '/pago/fallido?ref=' . $externalId,
                'pending' => SITE_URL . '/pago/pendiente?ref=' . $externalId,
            ],
            'auto_return'        => 'approved',
            'notification_url'   => WEBHOOK_URL,
            'external_reference' => $externalId,
            'statement_descriptor' => 'PANDORA BOX',
        ];

        $ch = curl_init('https://api.mercadopago.com/checkout/preferences');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($preference),
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . MP_ACCESS_TOKEN,
            ],
            CURLOPT_TIMEOUT        => 15,
        ]);
        $mpResponse = curl_exec($ch);
        $curlError  = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            throw new Exception('Error conectando con MercadoPago: ' . $curlError);
        }

        $mpData = json_decode($mpResponse, true);
        if (empty($mpData['id'])) {
            throw new Exception('MercadoPago error: ' . ($mpData['message'] ?? $mpResponse));
        }

        // Guardar preference_id en la orden
        $pdo->prepare("UPDATE web_orders SET mp_payment_id=? WHERE id=?")
            ->execute([$mpData['id'], $orderId]);

        echo json_encode([
            'ok'            => true,
            'orderId'       => $orderId,
            'externalId'    => $externalId,
            'total'         => $total,
            'initPoint'     => $mpData['init_point'],        // producción
            'sandboxPoint'  => $mpData['sandbox_init_point'], // pruebas
        ]);

    } catch (Exception $e) {
        if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
        apiError($e);
    }
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Not found']);
