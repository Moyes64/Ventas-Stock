<?php
/**
 * params.php — Parámetros públicos de la tienda
 * GET /api/params → { shippingCost: number, creditCardSurchargePct: number }
 * Subir a: public_html/pandorabox/api/params.php
 */

require_once __DIR__ . '/db.php';

corsHeaders('GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    initSchema();
    $pdo = getConnection();

    $stmt = $pdo->query("SELECT param_key, param_value FROM web_params");
    $rows = $stmt->fetchAll();

    $params = [];
    foreach ($rows as $row) {
        $params[$row['param_key']] = $row['param_value'];
    }

    echo json_encode([
        'shippingCost'           => (float)($params['costoEnvioWeb'] ?? 0),
        'creditCardSurchargePct' => (float)($params['recargoTarjetaCreditoWeb'] ?? 0),
    ]);

} catch (Exception $e) {
    // En caso de error (ej: tabla no existe aún), devolver defaults
    echo json_encode(['shippingCost' => 0, 'creditCardSurchargePct' => 0]);
}
