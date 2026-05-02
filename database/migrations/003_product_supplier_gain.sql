-- =============================================================================
-- Migration 003: Add supplier link and gain percent to products
-- =============================================================================

-- Add supplier reference to products
ALTER TABLE products ADD COLUMN supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN supplier_code TEXT    NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN gain_percent  REAL    NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
