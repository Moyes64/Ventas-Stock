-- =============================================================================
-- Migration 032: Módulo Pricing — margen objetivo individual por producto
-- Los productos de fabricación propia no siguen un % de margen unificado: cada
-- uno puede tener su propio margen objetivo (ej. un producto más elaborado
-- justifica más margen que otro). Si un producto no tiene fila acá, usa el
-- margen objetivo del grupo (P) como antes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pricing_product_margins (
  product_id     INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  margen_objetivo REAL   NOT NULL,
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
