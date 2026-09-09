-- =============================================================================
-- Migration 033: Pago combinado (split de dos medios de pago) por venta
-- =============================================================================
-- Hasta ahora `sales.payment_method` era un único valor por venta, y de ahí
-- leían directo el cierre de caja, la comisión de Mercado Pago y la
-- conciliación MP venta-por-venta. Para poder cobrar una venta repartida
-- entre dos medios (ej: efectivo + débito) se introduce el concepto de
-- "pierna de pago" en una tabla nueva, `sale_payments`: toda venta tiene desde
-- ahora una o más filas ahí (una si es simple, dos si es combinada), y son
-- esas filas las que hay que sumar/atribuir por medio de pago -- no
-- `sales.payment_method`, que para una venta combinada pasa a valer 'mixto'
-- (solo un resumen rápido para lecturas que no necesitan el detalle).
--
-- ── 1. Ampliar el CHECK de sales.payment_method con 'mixto' ─────────────────
-- SQLite no soporta ALTER COLUMN; se recrea la tabla (mismo patrón que
-- 014/023), incluyendo las columnas agregadas después por 028 (ALTER TABLE).

CREATE TABLE sales_new (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id          INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
  user_id              INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status               TEXT    NOT NULL DEFAULT 'PENDING_CAE',
  subtotal             REAL    NOT NULL DEFAULT 0,
  tax_amount           REAL    NOT NULL DEFAULT 0,
  total                REAL    NOT NULL DEFAULT 0,
  sale_date            TEXT    NOT NULL DEFAULT (date('now')),
  invoice_type         INTEGER,
  invoice_number       INTEGER,
  punto_venta          INTEGER,
  cae                  TEXT,
  cae_vto              TEXT,
  afip_error           TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  is_black_sale        INTEGER NOT NULL DEFAULT 0,
  discount_amount      REAL    NOT NULL DEFAULT 0,
  other_charges_amount REAL    NOT NULL DEFAULT 0,
  other_charges_label  TEXT    NOT NULL DEFAULT '',
  payment_method       TEXT    NOT NULL DEFAULT 'contado_efectivo'
    CHECK(payment_method IN (
      'contado_efectivo','transferencia','debito','credito','credito_cliente',
      'WEB_ORDER','mercadopago','qr','mixto'
    ))
);

INSERT INTO sales_new SELECT
  id, customer_id, user_id, status, subtotal, tax_amount, total, sale_date,
  invoice_type, invoice_number, punto_venta, cae, cae_vto, afip_error,
  created_at, updated_at, is_black_sale, discount_amount,
  other_charges_amount, other_charges_label, payment_method
FROM sales;

DROP TABLE sales;
ALTER TABLE sales_new RENAME TO sales;

CREATE INDEX IF NOT EXISTS idx_sales_customer  ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status    ON sales(status);

-- ── 2. Piernas de pago de cada venta ─────────────────────────────────────────

CREATE TABLE sale_payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id         INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method  TEXT    NOT NULL CHECK(payment_method IN (
    'contado_efectivo','transferencia','debito','credito','credito_cliente',
    'WEB_ORDER','mercadopago','qr'
  )),
  amount          REAL    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);

-- Backfill: toda venta existente tenía exactamente un medio de pago por el
-- total -- se refleja como su única pierna.
INSERT INTO sale_payments (sale_id, payment_method, amount, created_at)
SELECT id, payment_method, total, created_at FROM sales;

-- ── 3. Atribuir cada movimiento financiero a su pierna de pago ─────────────
-- Nullable: los movimientos que no vienen de una venta (aportes, gastos,
-- ajustes) siguen sin pierna asociada.

ALTER TABLE finance_movements ADD COLUMN sale_payment_id INTEGER REFERENCES sale_payments(id);
CREATE INDEX IF NOT EXISTS idx_finance_movements_sale_payment ON finance_movements(sale_payment_id);

-- Backfill: hasta esta migración cada venta tenía una sola pierna (recién
-- creada arriba, 1:1 con sale_id), así que el match es unívoco.
UPDATE finance_movements
SET sale_payment_id = (SELECT sp.id FROM sale_payments sp WHERE sp.sale_id = finance_movements.sale_id)
WHERE sale_id IS NOT NULL;

-- ── 4. Conciliación MP: pasa a ser por pierna, no por venta ─────────────────
-- Antes UNIQUE(sale_id) asumía una sola comisión MP por venta. Una venta
-- combinada puede tener dos piernas con comisión (ej. QR + Débito), así que
-- la clave única pasa a ser la pierna.

CREATE TABLE finance_mp_reconciliations_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id             INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sale_payment_id     INTEGER NOT NULL REFERENCES sale_payments(id) ON DELETE CASCADE,
  fecha               TEXT    NOT NULL,
  payment_method      TEXT    NOT NULL CHECK(payment_method IN ('qr', 'debito', 'credito', 'mercadopago')),
  bruto_sistema       REAL    NOT NULL,
  comision_sistema    REAL    NOT NULL,
  bruto_real          REAL    NOT NULL,
  comision_real       REAL    NOT NULL,
  neto_real           REAL    NOT NULL,
  diferencia          REAL    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'adjusted', 'ignored')),
  ajuste_movement_id  INTEGER REFERENCES finance_movements(id),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sale_payment_id)
);

-- Backfill: cada fila existente conciliaba una venta que (antes de esta
-- migración) tenía una sola pierna -- el match por sale_id es unívoco.
INSERT INTO finance_mp_reconciliations_new
  (id, sale_id, sale_payment_id, fecha, payment_method, bruto_sistema, comision_sistema,
   bruto_real, comision_real, neto_real, diferencia, status, ajuste_movement_id,
   created_at, updated_at)
SELECT
  r.id, r.sale_id,
  (SELECT sp.id FROM sale_payments sp WHERE sp.sale_id = r.sale_id),
  r.fecha, r.payment_method, r.bruto_sistema, r.comision_sistema,
  r.bruto_real, r.comision_real, r.neto_real, r.diferencia, r.status, r.ajuste_movement_id,
  r.created_at, r.updated_at
FROM finance_mp_reconciliations r;

DROP TABLE finance_mp_reconciliations;
ALTER TABLE finance_mp_reconciliations_new RENAME TO finance_mp_reconciliations;

CREATE INDEX IF NOT EXISTS idx_finance_mp_reconciliations_fecha
  ON finance_mp_reconciliations(fecha);
CREATE INDEX IF NOT EXISTS idx_finance_mp_reconciliations_sale
  ON finance_mp_reconciliations(sale_id);
