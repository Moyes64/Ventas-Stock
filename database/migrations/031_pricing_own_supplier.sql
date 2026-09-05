-- =============================================================================
-- Migration 031: Módulo Pricing — grupo "Fabricación propia"
-- Productos de un proveedor marcado como fabricación propia (ej. "Pandora Box")
-- tienen costo nominal/interno, no un costo de reventa real — se separan del
-- resto para no distorsionar la clasificación A/B/C ni el margen objetivo, y
-- reciben su propio margen objetivo, mucho mayor al de reventa.
-- =============================================================================

ALTER TABLE pricing_settings ADD COLUMN proveedor_propio_id INTEGER REFERENCES suppliers(id);
ALTER TABLE pricing_settings ADD COLUMN margen_objetivo_propio REAL NOT NULL DEFAULT 50;
