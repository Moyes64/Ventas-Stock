-- =============================================================================
-- Migration 024: Canal "Mercado Pago Web" (tienda online) como medio de pago
-- con comisión propia, separado del posnet físico (QR/Débito/Crédito).
-- =============================================================================
-- 'mercadopago' ya era un valor válido en sales.payment_method desde la
-- migración 014, pero nunca se usaba: los pedidos web pagados con MP se
-- mapeaban (por error) a 'transferencia', que no tiene comisión. La comisión
-- real de Mercado Pago Checkout Pro (tienda online) es de otro orden de
-- magnitud que la del posnet físico (~4.10% vs ~0.97% del QR) y tiene
-- acreditación diferida (~2-3 semanas) en vez de inmediata -- son canales
-- de cobro distintos y necesitan su propia tasa.

-- ── 1. Ampliar el CHECK de finance_mp_fee_rates y finance_mp_reconciliations
--       con 'mercadopago' (SQLite no soporta ALTER de un CHECK; se recrea).

CREATE TABLE finance_mp_fee_rates_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_method  TEXT    NOT NULL CHECK(payment_method IN ('qr', 'debito', 'credito', 'mercadopago')),
  pct             REAL    NOT NULL CHECK(pct >= 0),
  iva_pct         REAL    NOT NULL DEFAULT 21 CHECK(iva_pct >= 0),
  vigente_desde   TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(payment_method, vigente_desde)
);

INSERT INTO finance_mp_fee_rates_new SELECT * FROM finance_mp_fee_rates;
DROP TABLE finance_mp_fee_rates;
ALTER TABLE finance_mp_fee_rates_new RENAME TO finance_mp_fee_rates;

CREATE INDEX IF NOT EXISTS idx_finance_mp_fee_rates_method
  ON finance_mp_fee_rates(payment_method, vigente_desde);

CREATE TABLE finance_mp_reconciliations_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
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
  UNIQUE(fecha, payment_method)
);

INSERT INTO finance_mp_reconciliations_new SELECT * FROM finance_mp_reconciliations;
DROP TABLE finance_mp_reconciliations;
ALTER TABLE finance_mp_reconciliations_new RENAME TO finance_mp_reconciliations;

CREATE INDEX IF NOT EXISTS idx_finance_mp_reconciliations_fecha
  ON finance_mp_reconciliations(fecha);

-- ── 2. Tasa inicial para 'mercadopago' (tienda web), calculada a partir de
--       una constancia real de MP: venta de $15.200, se depositaron
--       $14.576,80 -> comisión de $623,20 = 4.10% exacto. iva_pct en 0
--       porque este 4.10% ya es el % efectivo total (no tenemos el desglose
--       neto/IVA de Checkout Pro, a diferencia del QR que Mercado Pago sí
--       informa desglosado).
--
-- vigente_desde fija en la fecha fundacional (mismo motivo que la tasa QR de
-- la migración 023): para que ventas web anteriores a la instalación de esta
-- versión también calculen la comisión correctamente.
INSERT INTO finance_mp_fee_rates (payment_method, pct, iva_pct, vigente_desde) VALUES
  ('mercadopago', 4.10, 0, '2026-08-01');
