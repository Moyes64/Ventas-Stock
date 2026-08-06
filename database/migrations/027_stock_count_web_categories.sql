-- =============================================================================
-- Migration 027: el conteo de stock filtra por categorías de Catálogo Web
-- =============================================================================
-- La tabla `categories` (Catálogo base) no tiene ninguna pantalla en toda la
-- app que permita asignarle un producto — `category_id` existe en el schema
-- pero ningún formulario lo expone, así que en la práctica siempre está
-- vacía. La única categorización viva y mantenida es la de Catálogo Web
-- (`web_categories` + `web_products.web_category_id`), así que el filtro de
-- sesión de conteo pasa a usar esa. Esto NO afecta la conciliación real: el
-- ajuste de stock siempre se aplica contra products.stock_quantity sin
-- importar qué categoría se usó para armar la sesión.
--
-- Recreamos las tablas en vez de un ALTER porque SQLite no permite cambiar
-- el target de una FK con ALTER, y no hay filas reales todavía (feature sin
-- publicar) — no hay nada que migrar.

DROP TABLE IF EXISTS stock_count_items;
DROP TABLE IF EXISTS stock_count_sessions;

CREATE TABLE stock_count_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  label           TEXT    NOT NULL,
  web_category_id INTEGER REFERENCES web_categories(id) ON DELETE SET NULL,
  status          TEXT    NOT NULL DEFAULT 'open'
                  CHECK(status IN ('open','uploaded','reconciled','cancelled')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  uploaded_at   TEXT,
  reconciled_at TEXT
);

CREATE TABLE stock_count_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        INTEGER NOT NULL REFERENCES stock_count_sessions(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  counted_quantity  REAL    NOT NULL,
  note              TEXT    NOT NULL DEFAULT '',
  reconciled        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_stock_count_items_session   ON stock_count_items(session_id);
CREATE INDEX idx_stock_count_sessions_status ON stock_count_sessions(status);
