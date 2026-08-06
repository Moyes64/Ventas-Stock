-- =============================================================================
-- Migration 018: Migrar el historial de cash_movements a finance_movements
-- =============================================================================
-- A partir de ahora los movimientos de la cuenta Caja se cargan únicamente
-- desde el módulo de Finanzas. cash_movements queda como tabla histórica,
-- sin más lecturas/escrituras desde el código.

INSERT INTO finance_movements (account_id, tipo, categoria_id, monto, descripcion, fecha, partner_id, supplier_id, sale_id)
SELECT
  (SELECT id FROM finance_accounts WHERE type = 'efectivo' LIMIT 1),
  cm.tipo,
  NULL,
  cm.monto,
  cm.descripcion,
  cm.movimiento_date,
  NULL,
  NULL,
  NULL
FROM cash_movements cm;
