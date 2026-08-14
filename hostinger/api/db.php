<?php
/**
 * db.php — Conexión MySQL + schema completo para la tienda Pandora Box
 * Subir a: public_html/pandorabox/api/db.php
 *
 * Los valores reales (contraseñas, API keys, tokens) NUNCA se hardcodean acá.
 * Se cargan desde config.local.php (no versionado, ver config.local.example.php)
 * o desde variables de entorno reales si el hosting las soporta.
 */

$localConfig = __DIR__ . '/config.local.php';
if (file_exists($localConfig)) {
    require_once $localConfig;
}

/** Exige que la variable de entorno exista; corta la ejecución con un error claro si falta. */
function requireEnv(string $name): string {
    $value = getenv($name);
    if ($value === false || $value === '') {
        http_response_code(500);
        echo json_encode(['error' => "Falta configurar $name. Ver hostinger/api/config.local.example.php"]);
        exit;
    }
    return $value;
}

define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', requireEnv('DB_NAME'));
define('DB_USER', requireEnv('DB_USER'));
define('DB_PASS', requireEnv('DB_PASS'));

// Clave compartida con la app Electron
define('EXPECTED_API_KEY', requireEnv('SYNC_API_KEY'));

// Directorio donde se guardan las imágenes de productos (relativo a public_html)
define('IMAGES_BASE_PATH', dirname(__DIR__) . '/images/products');
define('IMAGES_BASE_URL', 'https://lemonchiffon-dog-944242.hostingersite.com/pandorabox/images/products');

// MercadoPago
define('MP_ACCESS_TOKEN', requireEnv('MP_ACCESS_TOKEN'));
// Secret key de Webhooks (panel de MP > Tus integraciones > la app > Webhooks).
// Opcional: si no está seteada, validateMpWebhookSignature() se degrada a
// aceptar todo (igual que antes) en vez de romper el webhook — ver M3.
define('MP_WEBHOOK_SECRET', getenv('MP_WEBHOOK_SECRET') ?: '');
// URL del frontend (Next.js)
define('SITE_URL', getenv('SITE_URL') ?: 'https://pandorabox-web.vercel.app');
// URL del webhook — siempre apunta al servidor PHP
define('WEBHOOK_URL', 'https://lemonchiffon-dog-944242.hostingersite.com/pandorabox/api/webhook.php');

function getConnection(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

function validateApiKey(): void {
    $received = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if (!hash_equals(EXPECTED_API_KEY, $received)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}

/**
 * Valida la firma HMAC que MercadoPago manda en el header X-Signature de sus
 * webhooks (ver M3 de la auditoría). Sin esto, cualquiera que sepa la URL del
 * endpoint puede simular una notificación de MP; el impacto real ya estaba
 * acotado (el webhook siempre re-consulta el pago real contra la API de MP
 * con nuestro propio token antes de actuar), pero esto cierra el vector de
 * spam/replay antes de esa consulta.
 *
 * Se degrada con cuidado, mismo criterio que el resto de la auditoría:
 * - Si MP_WEBHOOK_SECRET no está configurada, no se puede validar nada →
 *   se deja pasar (como estaba antes) y se loguea una sola advertencia.
 * - Si está configurada pero la notificación no trae X-Signature (formato
 *   IPN viejo, que MP todavía puede mandar), tampoco se puede validar →
 *   se deja pasar pero se loguea, para poder auditarlo después.
 * - Si está configurada y el header viene pero no matchea, se rechaza.
 */
function isValidMpWebhookSignature(string $dataId): bool {
    if (MP_WEBHOOK_SECRET === '') {
        error_log('[webhook] MP_WEBHOOK_SECRET no configurada — validación de firma omitida (ver M3)');
        return true;
    }

    $xSignature = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
    $xRequestId = $_SERVER['HTTP_X_REQUEST_ID'] ?? '';
    if ($xSignature === '') {
        error_log('[webhook] Notificación sin X-Signature (¿formato IPN viejo?) — se deja pasar sin validar');
        return true;
    }

    $ts = null;
    $hash = null;
    foreach (explode(',', $xSignature) as $part) {
        [$key, $value] = array_pad(explode('=', trim($part), 2), 2, [null, null]);
        if ($key === 'ts') $ts = $value;
        if ($key === 'v1') $hash = $value;
    }
    if (!$ts || !$hash) return false;

    $manifest = "id:" . strtolower($dataId) . ";request-id:{$xRequestId};ts:{$ts};";
    $computed = hash_hmac('sha256', $manifest, MP_WEBHOOK_SECRET);
    return hash_equals($computed, $hash);
}

/**
 * Loguea el detalle real de la excepción (server-side, vía error_log) y le
 * devuelve al cliente un mensaje genérico en vez de $e->getMessage() — ver
 * M5 de la auditoría. Los mensajes de PDOException incluyen nombres de
 * tabla/columna y a veces fragmentos del SQL; los de MySQL/PHP pueden
 * incluir rutas del servidor. Nada de eso debería llegar a una respuesta
 * pública.
 */
function apiError(\Throwable $e, int $httpCode = 500, string $publicMessage = 'Error interno del servidor'): void {
    error_log('[api] ' . $e->getMessage());
    http_response_code($httpCode);
    echo json_encode(['error' => $publicMessage]);
}

function corsHeaders(string $methods = 'GET, OPTIONS'): void {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: ' . $methods);
    header('Access-Control-Allow-Headers: Content-Type, X-Api-Key');
    header('Content-Type: application/json; charset=utf-8');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Igual que corsHeaders() pero solo refleja el Origin si está en la lista
 * permitida, en vez de "*". Pensado para endpoints públicos de ESCRITURA
 * (ej. crear una orden) donde no queremos que cualquier página de internet
 * pueda dispararlos silenciosamente desde el navegador de un visitante.
 * No reemplaza el rate limiting: CORS solo frena a un navegador respetando
 * las reglas, no a un script que pega directo al endpoint.
 */
function corsHeadersRestricted(string $methods): void {
    $allowedOrigins = [SITE_URL, 'http://localhost:3000'];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: ' . $methods);
    header('Access-Control-Allow-Headers: Content-Type, X-Api-Key');
    header('Content-Type: application/json; charset=utf-8');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/** IP del cliente tal como la ve PHP directamente (sin confiar en headers que el cliente podría falsear). */
function clientIp(): string {
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// ── Rate limiting simple basado en MySQL (sin dependencias externas) ───────
// Mismo criterio en los dos usos (login del dashboard, creación de órdenes):
// contar intentos recientes por IP en una tabla chica, y podar lo viejo en
// cada escritura para que no crezca sin límite.

define('LOGIN_RATE_LIMIT_MAX_ATTEMPTS', 5);
define('LOGIN_RATE_LIMIT_WINDOW_MINUTES', 15);

function isLoginRateLimited(string $ip): bool {
    $pdo = getConnection();
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS n FROM dashboard_login_attempts
         WHERE ip = ? AND success = 0
           AND attempted_at > (NOW() - INTERVAL ' . LOGIN_RATE_LIMIT_WINDOW_MINUTES . ' MINUTE)'
    );
    $stmt->execute([$ip]);
    return (int)$stmt->fetch()['n'] >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
}

function recordLoginAttempt(string $ip, bool $success): void {
    $pdo = getConnection();
    $pdo->prepare('INSERT INTO dashboard_login_attempts (ip, success) VALUES (?, ?)')
        ->execute([$ip, $success ? 1 : 0]);
    $pdo->exec('DELETE FROM dashboard_login_attempts WHERE attempted_at < (NOW() - INTERVAL 1 DAY)');
}

define('ORDER_RATE_LIMIT_MAX_ATTEMPTS', 10);
define('ORDER_RATE_LIMIT_WINDOW_MINUTES', 15);

function isOrderCreationRateLimited(string $ip): bool {
    $pdo = getConnection();
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS n FROM order_creation_attempts
         WHERE ip = ?
           AND created_at > (NOW() - INTERVAL ' . ORDER_RATE_LIMIT_WINDOW_MINUTES . ' MINUTE)'
    );
    $stmt->execute([$ip]);
    return (int)$stmt->fetch()['n'] >= ORDER_RATE_LIMIT_MAX_ATTEMPTS;
}

function recordOrderCreationAttempt(string $ip): void {
    $pdo = getConnection();
    $pdo->prepare('INSERT INTO order_creation_attempts (ip) VALUES (?)')->execute([$ip]);
    $pdo->exec('DELETE FROM order_creation_attempts WHERE created_at < (NOW() - INTERVAL 1 DAY)');
}

function initSchema(): void {
    $pdo = getConnection();

    // Snapshots de sync (historial, máx 100)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS sync_snapshots (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            empresa     VARCHAR(255),
            payload     LONGTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Categorías del catálogo web
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS web_categories (
            id          INT PRIMARY KEY,
            name        VARCHAR(255) NOT NULL,
            slug        VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            sort_order  INT NOT NULL DEFAULT 0,
            updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Productos publicados
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS web_products (
            id                INT PRIMARY KEY,          -- = product_id de SQLite
            slug              VARCHAR(255) NOT NULL UNIQUE,
            name              VARCHAR(255) NOT NULL,
            visible           TINYINT(1)  NOT NULL DEFAULT 1,
            featured          TINYINT(1)  NOT NULL DEFAULT 0,
            price             DECIMAL(10,2) NOT NULL,
            stock             INT         NOT NULL DEFAULT 0,
            web_category_id   INT,
            short_description TEXT,
            long_description  MEDIUMTEXT,
            age_min           INT,
            players_min       INT,
            players_max       INT,
            play_time_min     INT,
            difficulty        INT,
            video_url         VARCHAR(500),
            tags              VARCHAR(500),
            sort_order        INT NOT NULL DEFAULT 0,
            updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (web_category_id) REFERENCES web_categories(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Imágenes de productos (rutas en filesystem)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS web_product_images (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            product_id  INT NOT NULL,
            filename    VARCHAR(500) NOT NULL,
            sort_order  INT NOT NULL DEFAULT 0,
            FOREIGN KEY (product_id) REFERENCES web_products(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Órdenes de la tienda web
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS web_orders (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            external_id      VARCHAR(100) NOT NULL UNIQUE,   -- UUID generado por Next.js
            customer_name    VARCHAR(255),
            customer_email   VARCHAR(255),
            customer_phone   VARCHAR(50),
            delivery_type    ENUM('pickup','shipping') NOT NULL DEFAULT 'pickup',
            delivery_address TEXT,
            total            DECIMAL(10,2) NOT NULL,
            payment_method   VARCHAR(50)   NOT NULL DEFAULT 'mercadopago',
            mp_payment_id    VARCHAR(100),
            status           ENUM('pending_payment','paid','pending_processing','processed','cancelled')
                             NOT NULL DEFAULT 'pending_payment',
            created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Líneas de cada orden
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS web_order_items (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            order_id     INT NOT NULL,
            product_id   INT NOT NULL,
            product_name VARCHAR(255) NOT NULL,
            quantity     INT          NOT NULL,
            unit_price   DECIMAL(10,2) NOT NULL,
            FOREIGN KEY (order_id) REFERENCES web_orders(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Historial de ventas (para el filtro por rango de fechas del dashboard)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS synced_sales (
            id             INT PRIMARY KEY,          -- = sale.id de SQLite
            sale_date      DATE NOT NULL,
            sale_time      VARCHAR(5) NOT NULL,
            total          DECIMAL(10,2) NOT NULL,
            payment_method VARCHAR(50) NOT NULL,
            status         VARCHAR(20) NOT NULL,
            updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX (sale_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS synced_sale_items (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            sale_id      INT NOT NULL,
            product_name VARCHAR(255) NOT NULL,
            quantity     INT NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES synced_sales(id) ON DELETE CASCADE,
            INDEX (sale_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Agregar columnas de documento si no existen (migraciones no destructivas)
    try { $pdo->exec("ALTER TABLE web_orders ADD COLUMN customer_doc_type VARCHAR(20)"); } catch (\Exception $e) {}
    try { $pdo->exec("ALTER TABLE web_orders ADD COLUMN customer_doc_number VARCHAR(50)"); } catch (\Exception $e) {}

    // Orden de exhibición de los destacados (migración no destructiva)
    try { $pdo->exec("ALTER TABLE web_products ADD COLUMN featured_order INT NOT NULL DEFAULT 0"); } catch (\Exception $e) {}

    // Desglose del total (envío / recargo tarjeta crédito) — migración no destructiva.
    // `total` ya los incluye; estas columnas son solo para poder mostrarlos por
    // separado en el comprobante en vez de una diferencia sin explicar.
    try { $pdo->exec("ALTER TABLE web_orders ADD COLUMN shipping_amount DECIMAL(10,2) NOT NULL DEFAULT 0"); } catch (\Exception $e) {}
    try { $pdo->exec("ALTER TABLE web_orders ADD COLUMN surcharge_amount DECIMAL(10,2) NOT NULL DEFAULT 0"); } catch (\Exception $e) {}
    try { $pdo->exec("ALTER TABLE web_orders ADD COLUMN surcharge_pct DECIMAL(5,2) NOT NULL DEFAULT 0"); } catch (\Exception $e) {}

    // Parámetros de la tienda (clave-valor, sincronizados desde Electron)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS web_params (
            param_key   VARCHAR(100) PRIMARY KEY,
            param_value TEXT NOT NULL,
            updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Rate limiting — intentos de login del dashboard (ver isLoginRateLimited() / A2)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS dashboard_login_attempts (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            ip           VARCHAR(45) NOT NULL,
            success      TINYINT(1) NOT NULL DEFAULT 0,
            attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX (ip, attempted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Rate limiting — creación de órdenes web (ver isOrderCreationRateLimited() / A1)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS order_creation_attempts (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            ip         VARCHAR(45) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX (ip, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}
