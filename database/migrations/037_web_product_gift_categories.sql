-- =============================================================================
-- Migration 037: Categorías de regalo de los productos web
-- =============================================================================
-- Selección curada (como los Destacados) de qué productos aparecen en cada
-- estampilla del buscador "Encontrá el regalo perfecto" de la home: Menores
-- de 6 años, Niños y niñas, Adolescentes, Jóvenes y más, Familia y Cajas de
-- Escape. Un producto puede estar en varias.
--
-- Se guardan como slugs separados por coma (ej. 'ninos,familia'); la lista
-- válida vive en electron/modules/web-catalog/giftCategories.ts.

ALTER TABLE web_products ADD COLUMN gift_categories TEXT NOT NULL DEFAULT '';
