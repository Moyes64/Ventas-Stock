-- =============================================================================
-- Migration 017: Vincular finance_movements con la venta que los originó
-- =============================================================================

ALTER TABLE finance_movements ADD COLUMN sale_id INTEGER REFERENCES sales(id);

CREATE INDEX IF NOT EXISTS idx_finance_movements_sale ON finance_movements(sale_id);
