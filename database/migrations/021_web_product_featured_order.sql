-- =============================================================================
-- Migration 021: Orden de los productos Destacados en la home
-- =============================================================================
-- El sort_order existente posiciona un producto dentro de su categoría, pero
-- los Destacados pueden venir de categorías distintas y necesitan su propio
-- orden para la sección de la home.

ALTER TABLE web_products ADD COLUMN featured_order INTEGER DEFAULT 0;
