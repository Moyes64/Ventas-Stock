-- Registro de cambios y devoluciones procesados
CREATE TABLE IF NOT EXISTS exchanges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id      INTEGER NOT NULL REFERENCES sales(id),
  product_id   INTEGER NOT NULL REFERENCES products(id),
  customer_id  INTEGER REFERENCES customers(id),
  quantity     INTEGER NOT NULL DEFAULT 1,
  amount       REAL    NOT NULL,
  notes        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_exchanges_sale    ON exchanges(sale_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_product ON exchanges(product_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_customer ON exchanges(customer_id);

-- Crédito de clientes (saldo a favor, generado por cambios/devoluciones o ajustes manuales)
CREATE TABLE IF NOT EXISTS customer_credits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount      REAL    NOT NULL,           -- positivo = crédito, negativo = uso de crédito
  type        TEXT    NOT NULL DEFAULT 'CAMBIO', -- CAMBIO | DEVOLUCION | USO | AJUSTE
  reference_id INTEGER,                  -- exchange_id o sale_id según el tipo
  notes       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_customer_credits_customer ON customer_credits(customer_id);
