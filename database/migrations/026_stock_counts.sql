-- =============================================================================
-- Migration 026: Conteo físico de stock (conciliación con app Android)
-- =============================================================================
-- Soporta el flujo de "conteo físico": desde Ventas-Stock se crea una sesión
-- (opcionalmente acotada a una categoría), una app Android la descarga por
-- Wi-Fi local, cuenta offline estante por estante y sube los conteos. Acá se
-- guardan esos conteos crudos; la conciliación (comparar contra
-- products.stock_quantity y aplicar el ajuste) se hace en vivo desde
-- StockCountService, reutilizando StockService.adjustStockAbsolute — por eso
-- esta tabla NO guarda una foto del stock del sistema al crear la sesión.

CREATE TABLE stock_count_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label       TEXT    NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  status      TEXT    NOT NULL DEFAULT 'open'
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
