-- =============================================================================
-- Migration 004: Black sales (ventas en negro / sin IVA)
-- =============================================================================

-- Add flag to identify black sales (ventas en negro, sin IVA)
ALTER TABLE sales ADD COLUMN is_black_sale INTEGER NOT NULL DEFAULT 0;

-- Index for fast dashboard query
CREATE INDEX IF NOT EXISTS idx_sales_black_sale ON sales(is_black_sale);
