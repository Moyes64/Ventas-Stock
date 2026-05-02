-- =============================================================================
-- Migration 005: Add voucher fields to stock_movements
-- =============================================================================

-- Add voucher tracking fields for ENTRY movements (FACTURA / REMITO)
ALTER TABLE stock_movements ADD COLUMN voucher_type   TEXT;    -- 'FACTURA' | 'REMITO'
ALTER TABLE stock_movements ADD COLUMN voucher_number TEXT;    -- Número de comprobante
ALTER TABLE stock_movements ADD COLUMN voucher_date   TEXT;    -- Fecha del comprobante (YYYY-MM-DD)
ALTER TABLE stock_movements ADD COLUMN supplier_id    INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_supplier ON stock_movements(supplier_id);
