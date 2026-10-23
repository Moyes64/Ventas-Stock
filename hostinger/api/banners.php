<?php
/**
 * banners.php — Banners promocionales de la home (Next.js)
 *
 * GET /api/banners.php → banners vigentes hoy (hora Argentina), en orden.
 *
 * Electron solo sincroniza los activos; acá se filtra además:
 *  - el rango de fechas (así se prenden/apagan solos aunque la notebook esté apagada)
 *  - los que llevan a un producto que dejó de estar visible o quedó sin stock
 *
 * Subir a: public_html/pandorabox/api/banners.php
 */

require_once __DIR__ . '/db.php';

corsHeaders('GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
}

try {
    initSchema();
    $pdo = getConnection();

    $today = substr(argentinaNow(), 0, 10);

    $stmt = $pdo->prepare("
        SELECT b.*, p.price AS product_price, p.compare_at_price AS product_compare_at_price,
               (SELECT i.filename FROM web_product_images i
                 WHERE i.product_id = b.link_product_id ORDER BY i.sort_order ASC LIMIT 1) AS product_image
        FROM web_banners b
        LEFT JOIN web_products p ON p.id = b.link_product_id
        WHERE (b.date_from IS NULL OR b.date_from <= ?)
          AND (b.date_to   IS NULL OR b.date_to   >= ?)
          AND (b.link_product_id IS NULL OR (p.visible = 1 AND p.stock > 0))
        ORDER BY b.sort_order ASC, b.id ASC
    ");
    $stmt->execute([$today, $today]);

    echo json_encode(array_map(fn($b) => [
        'id'          => (int)$b['id'],
        'title'       => $b['title'],
        'subtitle'    => $b['subtitle'],
        'badge'       => $b['badge'],
        'fine_print'  => $b['fine_print'],
        'theme'       => $b['theme'],
        // Imagen propia del banner; si no tiene y lleva a un producto, la primera del producto
        'image_url'   => $b['image_filename'] ? BANNER_IMAGES_URL . '/' . $b['image_filename']
                       : ($b['product_image'] ? IMAGES_BASE_URL . '/' . $b['product_image'] : null),
        'link_href'   => $b['link_href'],
        'button_text' => $b['button_text'],
        // Solo en banners de producto: precio actual y anterior (tachado si es mayor)
        'price'            => $b['link_product_id'] ? (float)$b['product_price'] : null,
        'compare_at_price' => $b['link_product_id'] && $b['product_compare_at_price'] !== null
            ? (float)$b['product_compare_at_price'] : null,
    ], $stmt->fetchAll()));

} catch (Exception $e) {
    apiError($e);
}
