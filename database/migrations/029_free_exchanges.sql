-- =============================================================================
-- Migration 029: Devoluciones sin ticket de cambio (carrito de productos
-- devueltos + productos nuevos entregados, con diferencia a favor o en contra
-- del cliente). No depende de una venta original ni de un QR de ticket.
-- =============================================================================

CREATE TABLE IF NOT EXISTS free_exchanges (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         INTEGER REFERENCES customers(id),
  returned_total      REAL    NOT NULL,
  new_total           REAL    NOT NULL,
  -- new_total - returned_total. Positivo = paga el cliente, negativo = se le devuelve, 0 = sin diferencia.
  difference          REAL    NOT NULL,
  -- Medio usado para saldar la diferencia (contado_efectivo, transferencia, debito,
  -- credito, qr, mercadopago, credito_cliente). NULL si difference = 0.
  settlement_method   TEXT,
  finance_movement_id INTEGER REFERENCES finance_movements(id),
  credit_id           INTEGER REFERENCES customer_credits(id),
  notes               TEXT,
  user_id             INTEGER REFERENCES users(id),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS free_exchange_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  free_exchange_id INTEGER NOT NULL REFERENCES free_exchanges(id),
  product_id       INTEGER NOT NULL REFERENCES products(id),
  direction        TEXT    NOT NULL CHECK(direction IN ('RETURN','NEW')),
  quantity         INTEGER NOT NULL,
  unit_price       REAL    NOT NULL,
  subtotal         REAL    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_free_exchanges_customer      ON free_exchanges(customer_id);
CREATE INDEX IF NOT EXISTS idx_free_exchange_items_exchange ON free_exchange_items(free_exchange_id);
CREATE INDEX IF NOT EXISTS idx_free_exchange_items_product  ON free_exchange_items(product_id);

-- Categoría de egreso para el efectivo devuelto al cliente cuando la diferencia
-- queda a su favor.
INSERT INTO finance_categories (name, applies_to)
SELECT 'Devolución a Cliente', 'egreso'
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE name = 'Devolución a Cliente');
