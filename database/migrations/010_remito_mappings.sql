-- Tabla de mapeos persistentes: código de artículo del proveedor → producto del sistema
CREATE TABLE IF NOT EXISTS remito_product_mappings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_code TEXT    NOT NULL,        -- código/artículo según el proveedor (ej: "FT903")
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(supplier_code)                  -- un código de proveedor → un solo producto
);

CREATE INDEX IF NOT EXISTS idx_remito_mappings_code ON remito_product_mappings(supplier_code);
