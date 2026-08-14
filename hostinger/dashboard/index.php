<?php
/**
 * Dashboard mobile-friendly para Ventas-Stock.
 * Subir a: /public_html/pandorabox/dashboard/index.php
 *
 * Protección básica con password (cambiar DASHBOARD_PASSWORD).
 */

require_once __DIR__ . '/../../pandorabox/api/db.php';

// DASHBOARD_PASSWORD se carga vía config.local.php (incluido por db.php arriba)
define('DASHBOARD_PASSWORD', requireEnv('DASHBOARD_PASSWORD'));

// Asegura que existan dashboard_login_attempts, sync_snapshots, etc. antes de
// tocarlas — initSchema() también se llama más abajo (ya autenticado), pero
// acá hace falta desde antes del login para poder contar los intentos.
// $schemaReady en false si esto falla (ej. MySQL caído un instante): el login
// sigue funcionando por password, simplemente sin rate limiting ese request,
// en vez de romperse por completo.
$schemaReady = true;
try { initSchema(); } catch (Exception $e) { $schemaReady = false; }

// ── Autenticación simple por sesión ───────────────────────────────────────
// Flags explícitos en la cookie de sesión (ver B4 de la auditoría): sin esto
// se depende de que la config por default de PHP en el hosting sea segura,
// en vez de garantizarlo acá. secure=true asume que el dashboard siempre se
// sirve por HTTPS (así es en Hostinger); httponly evita que JS la lea (mitiga
// robo de sesión vía XSS); samesite=Strict evita que la cookie viaje en
// requests iniciados desde otro sitio.
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();
$error = '';
$clientIp = clientIp();

if (isset($_POST['password'])) {
    if ($schemaReady && isLoginRateLimited($clientIp)) {
        $error = 'Demasiados intentos fallidos. Esperá ' . LOGIN_RATE_LIMIT_WINDOW_MINUTES . ' minutos e intentá de nuevo.';
    } elseif (hash_equals(DASHBOARD_PASSWORD, $_POST['password'])) {
        $_SESSION['auth'] = true;
        if ($schemaReady) { try { recordLoginAttempt($clientIp, true); } catch (Exception $e) {} }
    } else {
        if ($schemaReady) { try { recordLoginAttempt($clientIp, false); } catch (Exception $e) {} }
        $error = 'Contraseña incorrecta';
    }
}

if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: index.php');
    exit;
}

if (empty($_SESSION['auth'])) {
    // Mostrar formulario de login
    ?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ventas-Stock — Acceso</title>
<link rel="stylesheet" href="style.css">
</head>
<body class="login-body">
  <div class="login-card">
    <div class="login-logo">💼</div>
    <h1 class="login-title">Ventas-Stock</h1>
    <?php if ($error): ?><p class="login-error"><?= htmlspecialchars($error) ?></p><?php endif; ?>
    <form method="post" class="login-form">
      <input type="password" name="password" placeholder="Contraseña" autofocus class="login-input">
      <button type="submit" class="login-btn">Ingresar</button>
    </form>
  </div>
</body>
</html>
    <?php
    exit;
}

// ── Obtener último snapshot ───────────────────────────────────────────────
$snapshot = null;
$payload  = null;
$ago      = '';

try {
    initSchema();
    $pdo  = getConnection();
    $row  = $pdo->query(
        'SELECT payload, received_at FROM sync_snapshots ORDER BY id DESC LIMIT 1'
    )->fetch();

    if ($row) {
        $payload  = json_decode($row['payload'], true);
        $received = new DateTime($row['received_at']);
        $now      = new DateTime();
        $diff     = $now->diff($received);
        if ($diff->days > 0) {
            $ago = "hace {$diff->days} día(s)";
        } elseif ($diff->h > 0) {
            $ago = "hace {$diff->h} h {$diff->i} min";
        } else {
            $ago = "hace {$diff->i} min";
        }
    }
} catch (Exception $e) {
    $dbError = $e->getMessage();
}

// ── Ventas por rango de fechas ──────────────────────────────────────────────
$rangeFrom  = $_GET['from'] ?? date('Y-m-d', strtotime('-7 days'));
$rangeTo    = $_GET['to']   ?? date('Y-m-d');
$rangeSales = [];
$rangeTotal = 0.0;
$rangeError = '';

try {
    $pdo = getConnection();
    $stmt = $pdo->prepare(
        'SELECT id, sale_date, sale_time, total, payment_method, status
         FROM synced_sales
         WHERE sale_date BETWEEN ? AND ? AND status != "CANCELLED"
         ORDER BY sale_date DESC, sale_time DESC'
    );
    $stmt->execute([$rangeFrom, $rangeTo]);
    $rangeSales = $stmt->fetchAll();

    if ($rangeSales) {
        $ids = array_column($rangeSales, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $itemsStmt = $pdo->prepare(
            "SELECT sale_id, product_name, quantity FROM synced_sale_items WHERE sale_id IN ($placeholders)"
        );
        $itemsStmt->execute($ids);
        $rangeItemsBySale = [];
        foreach ($itemsStmt->fetchAll() as $it) {
            $rangeItemsBySale[$it['sale_id']][] = $it;
        }
        foreach ($rangeSales as $s) {
            $rangeTotal += (float)$s['total'];
        }
    }
} catch (Exception $e) {
    $rangeError = $e->getMessage();
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fmt(float $n): string {
    return '$&nbsp;' . number_format($n, 2, ',', '.');
}

$stock      = $payload['stock']      ?? [];
$ventasHoy  = $payload['ventasHoy']  ?? [];
$caja       = $payload['caja']       ?? [];
$finance    = $payload['finance']    ?? [];
$empresa    = htmlspecialchars($payload['empresa'] ?? 'Ventas-Stock');
$timestamp  = $payload['timestamp']  ?? '';
$lowStock   = array_filter($stock, fn($p) => $p['isLow'] ?? false);
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#1a1a2e">
<title><?= $empresa ?> — Dashboard</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

<header class="topbar">
  <span class="topbar-logo">💼</span>
  <span class="topbar-title"><?= $empresa ?></span>
  <a href="?logout" class="topbar-logout" title="Salir">⬚</a>
</header>

<?php if (!$payload): ?>
<div class="empty-state">
  <div class="empty-icon">📡</div>
  <p>Aún no se recibieron datos.<br>Configurá la sincronización en la aplicación.</p>
</div>
<?php else: ?>

<div class="sync-badge">
  Actualizado <?= htmlspecialchars($ago) ?>
  &nbsp;·&nbsp;
  <?= htmlspecialchars(substr($timestamp, 0, 10)) ?>
</div>

<!-- ═══════════════════ VENTAS HOY ═══════════════════ -->
<section class="section">
  <h2 class="section-title">🛒 Ventas de hoy</h2>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-value"><?= (int)($ventasHoy['count'] ?? 0) ?></div>
      <div class="kpi-label">Transacciones</div>
    </div>
    <div class="kpi-card kpi-card--accent">
      <div class="kpi-value"><?= fmt((float)($ventasHoy['total'] ?? 0)) ?></div>
      <div class="kpi-label">Total del día</div>
    </div>
  </div>

  <?php $pm = $ventasHoy['byPaymentMethod'] ?? []; ?>
  <div class="pay-grid">
    <?php $pmLabels = [
      'contado_efectivo' => ['💵','Efectivo'],
      'transferencia'    => ['📲','Transferencia'],
      'debito'           => ['💳','Débito'],
      'credito'          => ['💳','Crédito'],
    ]; ?>
    <?php foreach ($pmLabels as $key => [$icon, $label]): ?>
      <?php $val = (float)($pm[$key] ?? 0); if ($val <= 0) continue; ?>
      <div class="pay-item">
        <span class="pay-icon"><?= $icon ?></span>
        <span class="pay-label"><?= $label ?></span>
        <span class="pay-amount"><?= fmt($val) ?></span>
      </div>
    <?php endforeach; ?>
    <?php if (array_sum($pm) <= 0): ?>
      <p class="muted">Sin ventas registradas hoy</p>
    <?php endif; ?>
  </div>

  <?php $recent = $ventasHoy['recentSales'] ?? []; ?>
  <?php if (!empty($recent)): ?>
  <details class="collapsible">
    <summary>Últimas ventas (<?= count($recent) ?>)</summary>
    <table class="mini-table">
      <thead><tr><th>#</th><th>Hora</th><th>Método</th><th>Total</th></tr></thead>
      <tbody>
        <?php foreach ($recent as $s): ?>
        <tr>
          <td><?= (int)$s['id'] ?></td>
          <td><?= htmlspecialchars($s['time']) ?></td>
          <td><?= htmlspecialchars($s['paymentMethod']) ?></td>
          <td><?= fmt((float)$s['total']) ?></td>
        </tr>
        <tr class="sale-products-row">
          <td colspan="4" class="sale-products">
            <?php
              $items = $s['items'] ?? [];
              $parts = array_map(
                fn($i) => htmlspecialchars($i['productName']) . ((int)$i['quantity'] > 1 ? ' x' . (int)$i['quantity'] : ''),
                $items
              );
              echo $parts ? implode(', ', $parts) : '<span class="muted">—</span>';
            ?>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </details>
  <?php endif; ?>
</section>

<!-- ═══════════════════ VENTAS POR RANGO ═══════════════════ -->
<section class="section">
  <h2 class="section-title">🔎 Ventas por rango de fechas</h2>

  <form method="get" class="range-form">
    <div class="range-field">
      <label for="from">Desde</label>
      <input type="date" id="from" name="from" class="range-input" value="<?= htmlspecialchars($rangeFrom) ?>">
    </div>
    <div class="range-field">
      <label for="to">Hasta</label>
      <input type="date" id="to" name="to" class="range-input" value="<?= htmlspecialchars($rangeTo) ?>">
    </div>
    <button type="submit" class="range-btn">Filtrar</button>
  </form>

  <?php if ($rangeError): ?>
    <p class="muted">No se pudo consultar el historial (<?= htmlspecialchars($rangeError) ?>).</p>
  <?php else: ?>
    <div class="range-summary">
      <span class="muted"><?= count($rangeSales) ?> venta(s)</span>
      <strong><?= fmt($rangeTotal) ?></strong>
    </div>

    <?php if (empty($rangeSales)): ?>
      <p class="muted">Sin ventas en el rango seleccionado.</p>
    <?php else: ?>
    <table class="mini-table">
      <thead><tr><th>Fecha</th><th>Hora</th><th>Método</th><th>Total</th></tr></thead>
      <tbody>
        <?php foreach ($rangeSales as $s): ?>
        <tr>
          <td><?= htmlspecialchars($s['sale_date']) ?></td>
          <td><?= htmlspecialchars($s['sale_time']) ?></td>
          <td><?= htmlspecialchars($s['payment_method']) ?></td>
          <td><?= fmt((float)$s['total']) ?></td>
        </tr>
        <tr class="sale-products-row">
          <td colspan="4" class="sale-products">
            <?php
              $items = $rangeItemsBySale[$s['id']] ?? [];
              $parts = array_map(
                fn($i) => htmlspecialchars($i['product_name']) . ((int)$i['quantity'] > 1 ? ' x' . (int)$i['quantity'] : ''),
                $items
              );
              echo $parts ? implode(', ', $parts) : '<span class="muted">—</span>';
            ?>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
    <?php endif; ?>
  <?php endif; ?>
</section>

<!-- ═══════════════════ CAJA ═══════════════════ -->
<section class="section">
  <h2 class="section-title">💰 Caja</h2>
  <?php
  $cajaStatus = $caja['status'] ?? 'no_session';
  $statusLabel = match($cajaStatus) {
      'open'       => ['🟢', 'Abierta'],
      'closed'     => ['🔴', 'Cerrada'],
      default      => ['⚪', 'Sin apertura'],
  };
  ?>
  <div class="caja-status">
    <span><?= $statusLabel[0] ?></span>
    <strong><?= $statusLabel[1] ?></strong>
    <?php if ($caja['sessionDate'] ?? ''): ?>
      <span class="muted">&nbsp;·&nbsp;<?= htmlspecialchars($caja['sessionDate']) ?></span>
    <?php endif; ?>
  </div>

  <?php if ($cajaStatus !== 'no_session'): ?>
  <div class="caja-grid">
    <div class="caja-row">
      <span class="caja-lbl">Apertura</span>
      <span class="caja-val"><?= fmt((float)($caja['aperturaAmount'] ?? 0)) ?></span>
    </div>
    <div class="caja-row">
      <span class="caja-lbl">Ventas efectivo</span>
      <span class="caja-val"><?= fmt((float)($caja['efectivoVentas'] ?? 0)) ?></span>
    </div>
    <div class="caja-row">
      <span class="caja-lbl">Ingresos manuales</span>
      <span class="caja-val"><?= fmt((float)($caja['ingresosTotal'] ?? 0)) ?></span>
    </div>
    <div class="caja-row">
      <span class="caja-lbl">Egresos</span>
      <span class="caja-val caja-val--neg">- <?= fmt((float)($caja['egresosTotal'] ?? 0)) ?></span>
    </div>
    <div class="caja-row caja-row--total">
      <span class="caja-lbl">Total esperado</span>
      <span class="caja-val"><?= fmt((float)($caja['expectedTotal'] ?? 0)) ?></span>
    </div>
  </div>
  <?php endif; ?>
</section>

<!-- ═══════════════════ FINANZAS ═══════════════════ -->
<section class="section">
  <h2 class="section-title">💵 Finanzas</h2>

  <?php $accountBalances = $finance['accountBalances'] ?? []; ?>
  <div class="kpi-grid">
    <?php foreach ($accountBalances as $acc): ?>
    <div class="kpi-card">
      <div class="kpi-value"><?= fmt((float)($acc['balance'] ?? 0)) ?></div>
      <div class="kpi-label"><?= htmlspecialchars($acc['accountName'] ?? '') ?></div>
      <?php if ((float)($acc['pendingAmount'] ?? 0) > 0): ?>
      <div class="kpi-sub">
        🕓 <?= fmt((float)$acc['pendingAmount']) ?>
        <?php if ($acc['nextAccreditationDate'] ?? ''): ?>
          · <?= htmlspecialchars($acc['nextAccreditationDate']) ?>
        <?php endif; ?>
      </div>
      <?php endif; ?>
    </div>
    <?php endforeach; ?>
    <?php if (empty($accountBalances)): ?>
      <p class="muted">Sin cuentas registradas</p>
    <?php endif; ?>
  </div>

  <?php $pendingAccreditations = $finance['pendingAccreditations'] ?? []; ?>
  <?php if (!empty($pendingAccreditations)): ?>
  <details class="collapsible" open>
    <summary>🕓 Pendiente de acreditación (<?= count($pendingAccreditations) ?>)</summary>
    <table class="mini-table">
      <thead><tr><th>Cuenta</th><th>Monto</th><th>Acredita</th><th>Descripción</th></tr></thead>
      <tbody>
        <?php foreach ($pendingAccreditations as $p): ?>
        <tr>
          <td><?= htmlspecialchars($p['accountName'] ?? '') ?></td>
          <td><?= fmt((float)($p['monto'] ?? 0)) ?></td>
          <td class="text-warn"><?= htmlspecialchars($p['fechaAcreditacion'] ?? '') ?></td>
          <td class="muted"><?= htmlspecialchars($p['descripcion'] ?? '') ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </details>
  <?php endif; ?>

  <?php $recentTransfers = $finance['recentTransfers'] ?? []; ?>
  <?php if (!empty($recentTransfers)): ?>
  <details class="collapsible">
    <summary>🔁 Transferencias del mes (<?= count($recentTransfers) ?>)</summary>
    <table class="mini-table">
      <thead><tr><th>Fecha</th><th>Origen</th><th>Destino</th><th>Monto</th></tr></thead>
      <tbody>
        <?php foreach ($recentTransfers as $t): ?>
        <tr>
          <td><?= htmlspecialchars($t['fecha'] ?? '') ?></td>
          <td><?= htmlspecialchars($t['fromAccountName'] ?? '') ?></td>
          <td><?= htmlspecialchars($t['toAccountName'] ?? '') ?></td>
          <td><?= fmt((float)($t['monto'] ?? 0)) ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </details>
  <?php endif; ?>

  <?php $cashFlow = $finance['cashFlowMonth'] ?? null; ?>
  <?php if ($cashFlow): ?>
  <div class="caja-grid">
    <div class="caja-row">
      <span class="caja-lbl">Ingresos del mes</span>
      <span class="caja-val"><?= fmt((float)($cashFlow['ingresos'] ?? 0)) ?></span>
    </div>
    <div class="caja-row">
      <span class="caja-lbl">Egresos del mes</span>
      <span class="caja-val caja-val--neg">- <?= fmt((float)($cashFlow['egresos'] ?? 0)) ?></span>
    </div>
    <div class="caja-row caja-row--total">
      <span class="caja-lbl">Neto del mes</span>
      <span class="caja-val <?= ($cashFlow['neto'] ?? 0) < 0 ? 'caja-val--neg' : '' ?>">
        <?= fmt((float)($cashFlow['neto'] ?? 0)) ?>
      </span>
    </div>
  </div>
  <?php endif; ?>

  <?php $expensesByCategory = $finance['expensesByCategoryMonth'] ?? []; ?>
  <?php if (!empty($expensesByCategory)): ?>
  <details class="collapsible">
    <summary>Egresos por categoría (mes actual)</summary>
    <table class="mini-table">
      <thead><tr><th>Categoría</th><th>Total</th></tr></thead>
      <tbody>
        <?php foreach ($expensesByCategory as $e): ?>
        <tr>
          <td><?= htmlspecialchars($e['categoriaName'] ?? 'Sin categoría') ?></td>
          <td><?= fmt((float)($e['total'] ?? 0)) ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </details>
  <?php endif; ?>

  <?php $partnersEquity = $finance['partnersEquity'] ?? []; ?>
  <?php if (!empty($partnersEquity)): ?>
  <details class="collapsible" open>
    <summary>Patrimonio y retiros por socio</summary>
    <table class="mini-table">
      <thead><tr><th>Socio</th><th>%</th><th>Utilidad</th><th>Retiros</th><th>Saldo</th></tr></thead>
      <tbody>
        <?php foreach ($partnersEquity as $p): ?>
        <tr>
          <td><?= htmlspecialchars($p['partnerName'] ?? '') ?></td>
          <td><?= (float)($p['ownershipPct'] ?? 0) ?>%</td>
          <td><?= fmt((float)($p['utilidadAcumulada'] ?? 0)) ?></td>
          <td><?= fmt((float)($p['retirosRealizados'] ?? 0)) ?></td>
          <td class="<?= ($p['saldoPendiente'] ?? 0) < 0 ? 'text-danger' : '' ?>">
            <?= fmt((float)($p['saldoPendiente'] ?? 0)) ?>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </details>
  <?php endif; ?>
</section>

<!-- ═══════════════════ STOCK ═══════════════════ -->
<section class="section">
  <h2 class="section-title">📦 Stock</h2>

  <?php if (!empty($lowStock)): ?>
  <div class="alert-box">
    <strong>⚠️ <?= count($lowStock) ?> producto(s) con stock bajo</strong>
    <ul class="low-stock-list">
      <?php foreach ($lowStock as $p): ?>
      <li>
        <span class="ls-name"><?= htmlspecialchars($p['name']) ?></span>
        <span class="ls-qty <?= $p['currentStock'] == 0 ? 'ls-qty--zero' : '' ?>">
          <?= (int)$p['currentStock'] ?> / min <?= (int)$p['stockMin'] ?>
        </span>
      </li>
      <?php endforeach; ?>
    </ul>
  </div>
  <?php endif; ?>

  <details class="collapsible">
    <summary>Ver todos los productos (<?= count($stock) ?>)</summary>
    <div class="stock-search-wrapper">
      <input type="text" id="stockSearch" placeholder="Buscar producto..." class="stock-search" oninput="filterStock(this.value)">
    </div>
    <table class="mini-table" id="stockTable">
      <thead><tr><th>Producto</th><th>PRECIO</th><th>COSTO</th><th>%Gan.</th><th>Stock</th></tr></thead>
      <tbody>
        <?php foreach ($stock as $p): ?>
        <tr class="<?= ($p['isLow'] ?? false) ? 'row-low' : '' ?>">
          <td><?= htmlspecialchars($p['name']) ?></td>
          <td class="muted"><?= fmt((float)($p['precio'] ?? 0)) ?></td>
          <td class="muted"><?= fmt((float)($p['costo'] ?? 0)) ?></td>
          <td class="muted text-right"><?= number_format((float)($p['margen'] ?? 0), 1, ',', '.') ?>%</td>
          <td class="text-right <?= $p['currentStock'] == 0 ? 'text-danger' : (($p['isLow'] ?? false) ? 'text-warn' : '') ?>">
            <?= (int)$p['currentStock'] ?>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </details>
</section>

<?php endif; // end $payload check ?>

<footer class="footer">
  Ventas-Stock &copy; <?= date('Y') ?> &nbsp;·&nbsp; <a href="?">Actualizar</a>
</footer>

<script>
function filterStock(q) {
  q = q.toLowerCase();
  document.querySelectorAll('#stockTable tbody tr').forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
</script>
</body>
</html>
