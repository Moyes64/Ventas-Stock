-- =============================================================================
-- Migration 043: Banners web + precio anterior (tachado) de los productos web
-- =============================================================================
-- Banners promocionales de la home de la tienda web (debajo del Hero): ofertas
-- de productos o modalidades de pago. El link es opcional — un banner de un
-- medio de pago puede no llevar a ningún lado:
--   link_type = 'none'     → sin link ni botón
--   link_type = 'product'  → ficha del producto (link_product_id)
--   link_type = 'category' → catálogo filtrado por categoría web (link_category_id)
--   link_type = 'url'      → link_url (ruta interna "/catalogo?..." o URL externa)
-- button_text vacío con link = toda la tarjeta es clickeable, sin botón.
-- date_from/date_to (YYYY-MM-DD, opcionales) los evalúa banners.php en
-- Hostinger, así el banner se prende/apaga solo aunque la notebook esté apagada.

CREATE TABLE IF NOT EXISTS web_banners (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT    NOT NULL,
  subtitle          TEXT    NOT NULL DEFAULT '',
  badge             TEXT    NOT NULL DEFAULT '',
  fine_print        TEXT    NOT NULL DEFAULT '',
  theme             TEXT    NOT NULL DEFAULT 'gold' CHECK (theme IN ('gold', 'navy')),
  image_filename    TEXT,
  link_type         TEXT    NOT NULL DEFAULT 'none' CHECK (link_type IN ('none', 'product', 'category', 'url')),
  link_product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  link_category_id  INTEGER REFERENCES web_categories(id) ON DELETE SET NULL,
  link_url          TEXT    NOT NULL DEFAULT '',
  button_text       TEXT    NOT NULL DEFAULT '',
  date_from         TEXT,
  date_to           TEXT,
  active            INTEGER NOT NULL DEFAULT 1,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Precio "antes" que la web muestra tachado junto al precio actual. Solo se
-- muestra si es mayor al precio web efectivo (web_price ?? precio catálogo).
ALTER TABLE web_products ADD COLUMN compare_at_price REAL;
