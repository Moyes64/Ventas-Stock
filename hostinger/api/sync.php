<?php
/**
 * sync.php — Recibe el snapshot desde Ventas-Stock (Electron)
 * Método: POST
 * Header: X-Api-Key: <api_key>
 * Body: JSON con timestamp, empresa, stock, ventasHoy, caja, webCategories, webProducts
 *
 * Subir a: public_html/pandorabox/api/sync.php
 */

require_once __DIR__ . '/db.php';

corsHeaders('POST, OPTIONS');
validateApiKey();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody, true);

if (!is_array($payload) || empty($payload['timestamp'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid payload']);
    exit;
}

try {
    initSchema();
    $pdo = getConnection();

    // Guardar snapshot (historial, máx 100)
    $pdo->prepare('INSERT INTO sync_snapshots (empresa, payload) VALUES (?,?)')
        ->execute([$payload['empresa'] ?? '', $rawBody]);
    $pdo->exec("DELETE FROM sync_snapshots WHERE id NOT IN (
        SELECT id FROM (SELECT id FROM sync_snapshots ORDER BY id DESC LIMIT 100) t)");

    $stats = ['categories' => 0, 'products' => 0, 'images' => 0, 'stock_updated' => 0, 'sales_synced' => 0];

    // ── Historial de ventas ───────────────────────────────────────────────
    if (!empty($payload['salesHistory']) && is_array($payload['salesHistory'])) {
        $stmtSale = $pdo->prepare("
            INSERT INTO synced_sales (id, sale_date, sale_time, total, payment_method, status)
            VALUES (?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                sale_date=VALUES(sale_date), sale_time=VALUES(sale_time),
                total=VALUES(total), payment_method=VALUES(payment_method),
                status=VALUES(status)
        ");
        $stmtDelItems = $pdo->prepare("DELETE FROM synced_sale_items WHERE sale_id=?");
        $stmtItem = $pdo->prepare("
            INSERT INTO synced_sale_items (sale_id, product_name, quantity) VALUES (?,?,?)
        ");

        foreach ($payload['salesHistory'] as $sale) {
            $stmtSale->execute([
                $sale['id'], $sale['date'], $sale['time'],
                $sale['total'], $sale['paymentMethod'], $sale['status'],
            ]);
            $stmtDelItems->execute([$sale['id']]);
            foreach (($sale['items'] ?? []) as $item) {
                $stmtItem->execute([$sale['id'], $item['productName'], $item['quantity']]);
            }
            $stats['sales_synced']++;
        }
    }

    // ── Categorías ─────────────────────────────────────────────────────────
    if (!empty($payload['webCategories']) && is_array($payload['webCategories'])) {
        $stmtCat = $pdo->prepare("
            INSERT INTO web_categories (id, name, slug, description, sort_order)
            VALUES (?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                name=VALUES(name), slug=VALUES(slug),
                description=VALUES(description), sort_order=VALUES(sort_order)
        ");
        foreach ($payload['webCategories'] as $cat) {
            $stmtCat->execute([
                $cat['id'], $cat['name'], $cat['slug'],
                $cat['description'] ?? '', $cat['sortOrder'] ?? 0,
            ]);
            $stats['categories']++;
        }
    }

    // ── Productos ──────────────────────────────────────────────────────────
    if (!empty($payload['webProducts']) && is_array($payload['webProducts'])) {
        $stmtProd = $pdo->prepare("
            INSERT INTO web_products
                (id, slug, name, visible, featured, featured_order, price, stock, web_category_id,
                 short_description, long_description, age_min, players_min, players_max,
                 play_time_min, difficulty, video_url, tags, sort_order)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                slug=VALUES(slug), name=VALUES(name), visible=VALUES(visible),
                featured=VALUES(featured), featured_order=VALUES(featured_order),
                price=VALUES(price), stock=VALUES(stock),
                web_category_id=VALUES(web_category_id),
                short_description=VALUES(short_description),
                long_description=VALUES(long_description),
                age_min=VALUES(age_min), players_min=VALUES(players_min),
                players_max=VALUES(players_max), play_time_min=VALUES(play_time_min),
                difficulty=VALUES(difficulty), video_url=VALUES(video_url),
                tags=VALUES(tags), sort_order=VALUES(sort_order)
        ");

        // Consulta para obtener el nombre del producto desde web_products si ya existe
        // (el nombre viene en la clave 'name' si ya lo envía Electron, sino lo tomamos del slug)
        foreach ($payload['webProducts'] as $prod) {
            $productId = (int)$prod['productId'];
            $name = $prod['name'] ?? preg_replace('/-\d+$/', '', str_replace('-', ' ', $prod['slug']));
            $name = ucwords($name);

            $stmtProd->execute([
                $productId,
                $prod['slug'],
                $name,
                $prod['visible'] ? 1 : 0,
                $prod['featured'] ? 1 : 0,
                $prod['featuredOrder'] ?? 0,
                $prod['price'],
                $prod['stock'] ?? 0,
                $prod['webCategoryId'] ?? null,
                $prod['shortDescription'] ?? '',
                $prod['longDescription'] ?? '',
                $prod['ageMin'] ?? null,
                $prod['playersMin'] ?? null,
                $prod['playersMax'] ?? null,
                $prod['playTimeMin'] ?? null,
                $prod['difficulty'] ?? null,
                $prod['videoUrl'] ?? '',
                $prod['tags'] ?? '',
                $prod['sortOrder'] ?? 0,
            ]);
            $stats['products']++;

            // Las imágenes se gestionan por upload-image.php (no se tocan aquí)
        }

        // Actualizar stock de productos que NO vienen en el payload (quizás fuera de visibles)
        // también actualizamos desde el campo stock del payload recibido
        if (!empty($payload['stock']) && is_array($payload['stock'])) {
            $stmtStock = $pdo->prepare(
                'UPDATE web_products SET stock=? WHERE id=?'
            );
            foreach ($payload['stock'] as $item) {
                $stmtStock->execute([$item['currentStock'] ?? 0, $item['id']]);
                $stats['stock_updated']++;
            }
        }
    }

    // ── Parámetros de la tienda ────────────────────────────────────────────
    if (!empty($payload['webParams']) && is_array($payload['webParams'])) {
        $stmtParam = $pdo->prepare("
            INSERT INTO web_params (param_key, param_value)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE param_value=VALUES(param_value)
        ");
        foreach ($payload['webParams'] as $key => $value) {
            $stmtParam->execute([$key, (string)$value]);
        }
    }

    echo json_encode(['ok' => true, 'received_at' => date('c'), 'stats' => $stats]);

} catch (Exception $e) {
    apiError($e);
}
