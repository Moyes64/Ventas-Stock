<?php
/**
 * categories.php — Lista de categorías para el frontend
 *
 * GET /api/categories
 *
 * Subir a: public_html/pandorabox/api/categories.php
 */

require_once __DIR__ . '/db.php';

corsHeaders('GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
}

try {
    initSchema();
    $pdo = getConnection();

    $stmt = $pdo->query("
        SELECT c.*, COUNT(p.id) AS product_count
        FROM web_categories c
        LEFT JOIN web_products p ON p.web_category_id = c.id AND p.visible = 1
        GROUP BY c.id
        ORDER BY c.sort_order ASC, c.name ASC
    ");
    echo json_encode($stmt->fetchAll());

} catch (Exception $e) {
    apiError($e);
}
