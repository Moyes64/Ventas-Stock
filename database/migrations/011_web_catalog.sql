-- Categorías web (independientes de las categorías de catálogo interno)
CREATE TABLE IF NOT EXISTS web_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,
  description TEXT    DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  active      INTEGER DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    DEFAULT (datetime('now','localtime'))
);

-- Extensión de productos para la tienda web
CREATE TABLE IF NOT EXISTS web_products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  web_category_id   INTEGER REFERENCES web_categories(id) ON DELETE SET NULL,
  visible           INTEGER DEFAULT 0,         -- 0=oculto, 1=publicado
  featured          INTEGER DEFAULT 0,         -- producto destacado en home
  web_price         REAL    DEFAULT NULL,      -- NULL = usar precio del catálogo
  short_description TEXT    DEFAULT '',        -- descripción corta (para grilla)
  long_description  TEXT    DEFAULT '',        -- ficha completa
  age_min           INTEGER DEFAULT NULL,      -- edad mínima sugerida
  players_min       INTEGER DEFAULT NULL,
  players_max       INTEGER DEFAULT NULL,
  play_time_min     INTEGER DEFAULT NULL,      -- minutos
  difficulty        INTEGER DEFAULT NULL,      -- 1–5
  video_url         TEXT    DEFAULT '',        -- URL YouTube/Vimeo
  tags              TEXT    DEFAULT '',        -- separados por coma
  sort_order        INTEGER DEFAULT 0,
  created_at        TEXT    DEFAULT (datetime('now','localtime')),
  updated_at        TEXT    DEFAULT (datetime('now','localtime'))
);

-- Imágenes de productos web (hasta 5 por producto)
CREATE TABLE IF NOT EXISTS web_product_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  filename    TEXT    NOT NULL,                -- nombre del archivo guardado
  sort_order  INTEGER DEFAULT 0,              -- 0 = imagen principal
  created_at  TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_web_products_product   ON web_products(product_id);
CREATE INDEX IF NOT EXISTS idx_web_products_category  ON web_products(web_category_id);
CREATE INDEX IF NOT EXISTS idx_web_images_product     ON web_product_images(product_id);
