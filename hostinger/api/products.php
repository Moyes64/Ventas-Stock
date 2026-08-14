<?php
/**
 * products.php — Catálogo de productos para el frontend Next.js
 *
 * GET /api/products             → lista todos los visibles
 * GET /api/products?slug=xxx    → producto individual
 * GET /api/products?featured=1  → solo destacados
 * GET /api/products?category=slug
 * GET /api/products?search=palabra
 *
 * Subir a: public_html/pandorabox/api/products.php
 */

require_once __DIR__ . '/db.php';

corsHeaders('GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
}

try {
    initSchema();
    $pdo = getConnection();

    $slug     = $_GET['slug']     ?? null;
    $featured = isset($_GET['featured']) ? (bool)$_GET['featured'] : null;
    $catSlug  = $_GET['category'] ?? null;
    $search   = $_GET['search']   ?? null;

    // ── Producto individual ───────────────────────────────────────────────
    if ($slug !== null) {
        $row = $pdo->prepare("
            SELECT p.*, c.name AS category_name, c.slug AS category_slug
            FROM web_products p
            LEFT JOIN web_categories c ON c.id = p.web_category_id
            WHERE p.slug = ? AND p.visible = 1
        ")->execute([$slug]) ? null : null;

        $stmt = $pdo->prepare("
            SELECT p.*, c.name AS category_name, c.slug AS category_slug
            FROM web_products p
            LEFT JOIN web_categories c ON c.id = p.web_category_id
            WHERE p.slug = ? AND p.visible = 1
        ");
        $stmt->execute([$slug]);
        $product = $stmt->fetch();

        if (!$product) {
            http_response_code(404);
            echo json_encode(['error' => 'Product not found']);
            exit;
        }

        $product['images'] = getProductImages($pdo, (int)$product['id']);
        $product['thumbnail'] = $product['images'][0] ?? null;
        echo json_encode($product);
        exit;
    }

    // ── Lista de productos ────────────────────────────────────────────────
    $where  = ['p.visible = 1'];
    $params = [];

    if ($featured !== null) {
        $where[] = 'p.featured = ?';
        $params[] = $featured ? 1 : 0;
    }
    if ($catSlug !== null) {
        $where[] = 'c.slug = ?';
        $params[] = $catSlug;
    }
    if ($search !== null) {
        $where[] = '(p.name LIKE ? OR p.short_description LIKE ? OR p.tags LIKE ?)';
        $term = '%' . $search . '%';
        $params[] = $term; $params[] = $term; $params[] = $term;
    }

    $sql = "
        SELECT p.*, c.name AS category_name, c.slug AS category_slug
        FROM web_products p
        LEFT JOIN web_categories c ON c.id = p.web_category_id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY p.featured DESC, p.featured_order ASC, c.sort_order ASC, p.sort_order ASC, p.name ASC
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $products = $stmt->fetchAll();

    // Para la lista solo incluimos la primera imagen (thumbnail)
    foreach ($products as &$prod) {
        $imgs = getProductImages($pdo, (int)$prod['id'], 1);
        $prod['thumbnail'] = $imgs[0] ?? null;
    }
    unset($prod);

    echo json_encode($products);

} catch (Exception $e) {
    apiError($e);
}

function getProductImages(PDO $pdo, int $productId, int $limit = 10): array {
    $sql = 'SELECT filename, sort_order FROM web_product_images WHERE product_id=? ORDER BY sort_order ASC';
    if ($limit < 10) $sql .= ' LIMIT ' . $limit;
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$productId]);
    return array_map(function($r) {
        return [
            'url'        => IMAGES_BASE_URL . '/' . $r['filename'],
            'sort_order' => (int)$r['sort_order'],
        ];
    }, $stmt->fetchAll());
}
