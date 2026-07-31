-- =============================================================================
-- Migration 019: Backfill de finance_movements para ventas en efectivo existentes
-- =============================================================================
-- A partir de ahora toda venta (cualquier medio de pago) genera su propio
-- finance_movement. Esta migración crea retroactivamente el de las ventas en
-- efectivo que ya estaban cargadas antes de este cambio.

INSERT INTO finance_movements (account_id, tipo, categoria_id, monto, descripcion, fecha, partner_id, supplier_id, sale_id)
SELECT
  (SELECT id FROM finance_accounts WHERE type = 'efectivo' LIMIT 1),
  'ingreso',
  (SELECT id FROM finance_categories WHERE name = 'Venta' LIMIT 1),
  s.total,
  'Venta #' || s.id,
  s.sale_date,
  NULL,
  NULL,
  s.id
FROM sales s
WHERE s.payment_method = 'contado_efectivo' AND s.status != 'CANCELLED'
  AND NOT EXISTS (SELECT 1 FROM finance_movements fm WHERE fm.sale_id = s.id);
