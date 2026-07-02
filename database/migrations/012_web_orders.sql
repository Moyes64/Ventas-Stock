-- Registro de órdenes web ya procesadas (evita reprocesar)
CREATE TABLE IF NOT EXISTS web_orders_processed (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id  TEXT    NOT NULL UNIQUE,
  sale_id      INTEGER NOT NULL REFERENCES sales(id),
  processed_at TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_web_orders_external ON web_orders_processed(external_id);
