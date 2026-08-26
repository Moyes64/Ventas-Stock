<?php
/**
 * search-logs.php — Analítica del buscador rápido de la home de pandorabox-web
 * ("Encontrá el regalo perfecto": filtro por rango de precio).
 *
 * POST /api/search-logs.php  → pandorabox-web registra una búsqueda (público,
 *                               sin API key, origen restringido — mismo
 *                               criterio que POST /api/orders).
 *                               body: { precio, internal? }
 * GET  /api/search-logs.php  → Ventas-Stock trae el reporte agregado para la
 *                               sección Reportes (requiere X-Api-Key).
 *                               ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&includeInternal=1
 *
 * Los valores válidos de precio son los mismos rangos que lib/filters.ts en
 * pandorabox-web — si esos rangos cambian ahí, actualizar la lista de abajo
 * también.
 *
 * Nota: hasta 2026-08-25 este endpoint también trackeaba edad sugerida y
 * cantidad de jugadores — se sacaron tras revisar la usabilidad del buscador
 * (ver historial de git y la migración DROP COLUMN en db.php).
 *
 * Nota: created_at se inserta explícito en hora Argentina (argentinaNow() en
 * db.php) en vez de dejar el DEFAULT CURRENT_TIMESTAMP de la columna — ver
 * ese helper para el porqué (afecta el filtro por fecha del GET de abajo).
 *
 * Subir a: public_html/pandorabox/api/search-logs.php
 */

require_once __DIR__ . '/db.php';

corsHeadersRestricted('GET, POST, OPTIONS');

const PRICE_BUCKETS = [
    'hasta-15' => 'Hasta $15.000',
    '15-30'    => '$15.000 – $30.000',
    '30-50'    => '$30.000 – $50.000',
    '50-80'    => '$50.000 – $80.000',
    'mas-80'   => '+$80.000',
];

/** Cuenta cuántas filas caen en cada bucket de $field, en el mismo orden que $labels. */
function countBuckets(array $rows, string $field, array $labels): array {
    $counts = array_fill_keys(array_keys($labels), 0);
    foreach ($rows as $r) {
        if ($r[$field] !== null && isset($counts[$r[$field]])) {
            $counts[$r[$field]]++;
        }
    }
    $out = [];
    foreach ($labels as $value => $label) {
        // (string) porque PHP normaliza claves de array numéricas a int —
        // no aplica hoy (los values de precio no son numéricos), se deja
        // por las dudas si se agrega algún bucket numérico más adelante.
        $out[] = ['value' => (string)$value, 'label' => $label, 'count' => $counts[$value]];
    }
    return $out;
}

$method = $_SERVER['REQUEST_METHOD'];

// ── POST — pandorabox-web registra una búsqueda ───────────────────────────
if ($method === 'POST') {
    try { initSchema(); } catch (Exception $e) {
        apiError($e);
        exit;
    }

    // Rate limit por IP: es una analítica sin costo de plata/stock si la
    // spamean, pero igual conviene un piso para que un script no la use para
    // llenar la tabla de basura sin ningún freno (mismo criterio que A1 en
    // POST /api/orders).
    $clientIp = clientIp();
    if (isSearchLogRateLimited($clientIp)) {
        http_response_code(429);
        echo json_encode(['error' => 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.']);
        exit;
    }
    recordSearchLogAttempt($clientIp);

    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $precio = (isset($body['precio']) && array_key_exists($body['precio'], PRICE_BUCKETS)) ? $body['precio'] : null;
    $internal = !empty($body['internal']) ? 1 : 0;

    if ($precio === null) {
        http_response_code(400);
        echo json_encode(['error' => 'La búsqueda no tiene un precio válido']);
        exit;
    }

    try {
        $pdo = getConnection();
        // created_at explícito en hora Argentina (ver argentinaNow() en db.php) en
        // vez del DEFAULT CURRENT_TIMESTAMP de la columna, que usa el timezone del
        // hosting y podía correr una búsqueda de último momento al "día siguiente"
        // en el reporte filtrado por fecha local.
        $stmt = $pdo->prepare('INSERT INTO search_logs (created_at, precio, is_internal) VALUES (?, ?, ?)');
        $stmt->execute([argentinaNow(), $precio, $internal]);
        echo json_encode(['ok' => true]);
    } catch (Exception $e) {
        apiError($e);
    }
    exit;
}

// ── GET — Ventas-Stock trae el reporte agregado ───────────────────────────
if ($method === 'GET') {
    validateApiKey();

    try {
        initSchema();
        $pdo = getConnection();

        $dateFrom = $_GET['dateFrom'] ?? null;
        $dateTo = $_GET['dateTo'] ?? null;
        $includeInternal = !empty($_GET['includeInternal']);

        $conditions = [];
        $params = [];
        if (!$includeInternal) {
            $conditions[] = 'is_internal = 0';
        }
        if ($dateFrom) {
            $conditions[] = 'created_at >= ?';
            $params[] = $dateFrom . ' 00:00:00';
        }
        if ($dateTo) {
            $conditions[] = 'created_at <= ?';
            $params[] = $dateTo . ' 23:59:59';
        }
        $where = $conditions ? ('WHERE ' . implode(' AND ', $conditions)) : '';

        $stmt = $pdo->prepare("SELECT precio FROM search_logs $where");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        echo json_encode([
            'totalSearches' => count($rows),
            'priceBuckets' => countBuckets($rows, 'precio', PRICE_BUCKETS),
        ]);
    } catch (Exception $e) {
        apiError($e);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
