<?php
/**
 * upload-image.php — Recibe imágenes individuales en base64 desde Ventas-Stock
 * Método: POST application/json
 * Header: X-Api-Key: <api_key>
 * Body: { productId, sortOrder, base64 }  → imagen de producto
 *       { bannerId, base64 }              → imagen de un banner de la home (el
 *         nombre del archivo es el que ya llegó en el sync, web_banners.image_filename)
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
$bannerId  = isset($data['bannerId']) ? (int)$data['bannerId'] : 0;
$sortOrder = isset($data['sortOrder']) ? (int)$data['sortOrder'] : 0;
$base64    = $data['base64'] ?? '';

if (($productId <= 0 && $bannerId <= 0) || empty($base64)) {
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

    // ── Imagen de banner ──────────────────────────────────────────────────
    // El nombre sale de la base (validado en sync.php), nunca del request.
    if ($bannerId > 0) {
        $stmt = $pdo->prepare('SELECT image_filename FROM web_banners WHERE id=?');
        $stmt->execute([$bannerId]);
        $filename = $stmt->fetchColumn();
        if (!$filename) {
            echo json_encode(['ok' => false, 'reason' => 'banner_not_found']);
            exit;
        }
        if (!is_dir(BANNER_IMAGES_PATH)) {
            mkdir(BANNER_IMAGES_PATH, 0755, true);
        }
        $destPath = BANNER_IMAGES_PATH . '/' . $filename;
        if (!file_exists($destPath)) {
            file_put_contents($destPath, $binaryData);
        }
        // Borra las imágenes viejas de ese banner (cada carga nueva tiene otro nombre)
        foreach (glob(BANNER_IMAGES_PATH . '/banner_' . $bannerId . '_*') ?: [] as $old) {
            if (basename($old) !== $filename) @unlink($old);
        }
        echo json_encode(['ok' => true, 'filename' => $filename]);
        exit;
    }

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

    // Solo escribir si cambió el contenido (antes se comparaba el tamaño: una foto
    // nueva con el mismo peso no se actualizaba). Reescribirla cambia su fecha y
    // con eso la versión de la URL (ver productImageUrl() en db.php).
    if (!file_exists($destPath) || md5_file($destPath) !== md5($binaryData)) {
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
