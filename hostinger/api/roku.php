<?php
/**
 * roku.php — Lista liviana para la vidriera digital del local (app Roku)
 *
 * GET /api/roku.php            → todos los productos visibles con stock y foto
 * GET /api/roku.php?featured=1 → solo destacados
 * GET /api/roku.php?category=slug / ?gift=slug
 *
 * Respuesta: [{ name, price, priceText, imageUrl, jpgUrl }] — una imagen por
 * producto. jpgUrl pasa por roku-image.php (JPG achicado a 1000px): la app la
 * usa si la original no carga (ej. WebP no soportado por el Roku).
 * El Roku tiene poca memoria y BrightScript parsea JSON lento: no agregar
 * campos que la app no use.
 *
 * Subir a: public_html/pandorabox/api/roku.php
 */

require_once __DIR__ . '/db.php';

corsHeaders('GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
}

try {
    $pdo = getConnection();

    $where  = ['p.visible = 1', 'p.stock > 0'];
    $params = [];

    if (!empty($_GET['featured'])) {
        $where[] = 'p.featured = 1';
    }
    if (!empty($_GET['category'])) {
        $where[] = 'c.slug = ?';
        $params[] = $_GET['category'];
    }
    if (!empty($_GET['gift'])) {
        $where[] = 'FIND_IN_SET(?, p.gift_categories) > 0';
        $params[] = $_GET['gift'];
    }

    // Primera imagen de cada producto en una sola consulta (products.php hace
    // una por producto; con ~270 productos acá conviene evitarlo).
    $sql = "
        SELECT p.name, p.price, i.filename
        FROM web_products p
        LEFT JOIN web_categories c ON c.id = p.web_category_id
        JOIN web_product_images i ON i.id = (
            SELECT i2.id FROM web_product_images i2
            WHERE i2.product_id = p.id
            ORDER BY i2.sort_order ASC, i2.id ASC
            LIMIT 1
        )
        WHERE " . implode(' AND ', $where) . "
        ORDER BY p.featured DESC, p.featured_order ASC, c.sort_order ASC, p.sort_order ASC, p.name ASC
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $proxyBase = dirname(WEBHOOK_URL) . '/roku-image.php?f=';
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $price = (float)$r['price'];
        $out[] = [
            'name'      => $r['name'],
            'price'     => $price,
            // Formato del local: "$ 12.345" (sin decimales, punto de miles)
            'priceText' => '$ ' . number_format($price, 0, ',', '.'),
            'imageUrl'  => IMAGES_BASE_URL . '/' . $r['filename'],
            'jpgUrl'    => $proxyBase . rawurlencode($r['filename']),
        ];
    }

    // La app refresca cada ~30 min; un poco de cache del lado del cliente no molesta
    header('Cache-Control: public, max-age=300');
    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

} catch (Exception $e) {
    apiError($e);
}
