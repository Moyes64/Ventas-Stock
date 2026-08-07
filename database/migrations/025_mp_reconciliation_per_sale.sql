-- =============================================================================
-- Migration 025: Conciliación de Mercado Pago venta por venta (no por total diario)
-- =============================================================================
-- La conciliación original (migración 023) comparaba un total agregado por
-- medio de pago y día contra el resumen de MP. En la práctica esconde cuál
-- venta puntual tiene diferencia -- dos errores que se cancelan entre sí pasan
-- desapercibidos. Esta migración cambia finance_mp_reconciliations para que
-- cada fila sea la conciliación de UNA venta (sale_id), y la pantalla filtra
-- las ventas a conciliar por día (y opcionalmente por medio de pago).
--
-- fecha y payment_method quedan denormalizados en la fila (copiados de la
-- venta al guardar) para no tener que hacer JOIN en cada listado/filtro.
--
-- La tabla está vacía en este momento (0 filas conciliadas todavía), así que
-- no hace falta migrar datos -- se recrea directamente con el nuevo esquema.

CREATE TABLE finance_mp_reconciliations_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id             INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
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
  UNIQUE(sale_id)
);

INSERT INTO finance_mp_reconciliations_new
  (id, fecha, payment_method, bruto_sistema, comision_sistema, bruto_real, comision_real,
   neto_real, diferencia, status, ajuste_movement_id, created_at, updated_at, sale_id)
SELECT
  r.id, r.fecha, r.payment_method, r.bruto_sistema, r.comision_sistema, r.bruto_real, r.comision_real,
  r.neto_real, r.diferencia, r.status, r.ajuste_movement_id, r.created_at, r.updated_at,
  -- Por si alguna instalación ya tiene filas viejas (agregadas por día): las ata a la
  -- primera venta de ese día/medio para no perder el registro histórico del ajuste.
  (SELECT s.id FROM sales s WHERE s.sale_date = r.fecha AND s.payment_method = r.payment_method
   ORDER BY s.id ASC LIMIT 1) AS sale_id
FROM finance_mp_reconciliations r
WHERE (SELECT s.id FROM sales s WHERE s.sale_date = r.fecha AND s.payment_method = r.payment_method
       ORDER BY s.id ASC LIMIT 1) IS NOT NULL;

DROP TABLE finance_mp_reconciliations;
ALTER TABLE finance_mp_reconciliations_new RENAME TO finance_mp_reconciliations;

CREATE INDEX IF NOT EXISTS idx_finance_mp_reconciliations_fecha
  ON finance_mp_reconciliations(fecha);
CREATE INDEX IF NOT EXISTS idx_finance_mp_reconciliations_sale
  ON finance_mp_reconciliations(sale_id);
