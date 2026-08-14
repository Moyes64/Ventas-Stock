<?php
/**
 * upload-image.php — Recibe imágenes individuales en base64 desde Ventas-Stock
 * Método: POST application/json
 * Header: X-Api-Key: <api_key>
 * Body: { productId, sortOrder, base64 }
 */

require_once __DIR__ . '/db.php';

corsHeaders('POST, OPTIONS');
validateApiKey();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$productId = isset($data['productId']) ? (int)$data['productId'] : 0;
$sortOrder = isset($data['sortOrder']) ? (int)$data['sortOrder'] : 0;
$base64    = $data['base64'] ?? '';

if ($productId <= 0 || empty($base64)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing productId or base64']);
    exit;
}

// Lista blanca real de extensiones de imagen — el mime type de un data URI lo
// elige quien arma el request, así que no alcanza con "matchea el patrón
// image/(\w+)": eso dejaba pasar cualquier palabra (ej. "image/php") y esa
// palabra se usaba tal cual como extensión del archivo escrito en el disco
// público del hosting. Con esta lista, cualquier extensión que no sea una
// imagen real se rechaza acá, antes de tocar el filesystem.
const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

if (!preg_match('/^data:image\/(\w+);base64,/', $base64, $m)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid base64 format']);
    exit;
}

$ext = strtolower($m[1]);
if ($ext === 'jpeg') $ext = 'jpg';

if (!in_array($ext, ALLOWED_IMAGE_EXTENSIONS, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Extensión de imagen no permitida']);
    exit;
}
$binaryData = base64_decode(substr($base64, strpos($base64, ',') + 1));
if ($binaryData === false) {
    http_response_code(400);
    echo json_encode(['error' => 'base64 decode failed']);
    exit;
}

try {
    initSchema();
    $pdo = getConnection();

    $imagesDir = IMAGES_BASE_PATH . '/' . $productId;
    if (!is_dir($imagesDir)) {
        mkdir($imagesDir, 0755, true);
    }

    $filename   = 'img_' . $sortOrder . '.' . $ext;
    $destPath   = $imagesDir . '/' . $filename;
    $dbFilename = $productId . '/' . $filename;

    // Verificar que el producto exista antes de insertar imagen (FK)
    $exists = $pdo->prepare('SELECT id FROM web_products WHERE id=?');
    $exists->execute([$productId]);
    if (!$exists->fetch()) {
        echo json_encode(['ok' => false, 'reason' => 'product_not_found']);
        exit;
    }

    // Solo escribir si cambió (comparar tamaño como proxy rápido)
    if (!file_exists($destPath) || filesize($destPath) !== strlen($binaryData)) {
        file_put_contents($destPath, $binaryData);
    }

    $pdo->prepare("
        INSERT INTO web_product_images (product_id, filename, sort_order)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE filename=VALUES(filename), sort_order=VALUES(sort_order)
    ")->execute([$productId, $dbFilename, $sortOrder]);

    echo json_encode(['ok' => true, 'filename' => $dbFilename]);

} catch (Exception $e) {
    apiError($e);
}
