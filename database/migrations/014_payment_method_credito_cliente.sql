-- Ampliar el CHECK constraint de payment_method para incluir 'credito_cliente'.
-- SQLite no soporta ALTER COLUMN; se recrea la tabla.
-- PRAGMA foreign_keys se maneja desde migrate.ts (fuera de la transacción).

CREATE TABLE sales_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT    NOT NULL DEFAULT 'PENDING_CAE',
  subtotal        REAL    NOT NULL DEFAULT 0,
  tax_amount      REAL    NOT NULL DEFAULT 0,
  total           REAL    NOT NULL DEFAULT 0,
  sale_date       TEXT    NOT NULL DEFAULT (date('now')),
  invoice_type    INTEGER,
  invoice_number  INTEGER,
  punto_venta     INTEGER,
  cae             TEXT,
  cae_vto         TEXT,
  afip_error      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  is_black_sale   INTEGER NOT NULL DEFAULT 0,
  discount_amount REAL    NOT NULL DEFAULT 0,
  payment_method  TEXT    NOT NULL DEFAULT 'contado_efectivo'
    CHECK(payment_method IN (
      'contado_efectivo','transferencia','debito','credito','credito_cliente',
      'WEB_ORDER','mercadopago'
    ))
);

INSERT INTO sales_new SELECT
  id, customer_id, user_id, status, subtotal, tax_amount, total, sale_date,
  invoice_type, invoice_number, punto_venta, cae, cae_vto, afip_error,
  created_at, updated_at, is_black_sale, discount_amount, payment_method
FROM sales;

DROP TABLE sales;
ALTER TABLE sales_new RENAME TO sales;

CREATE INDEX IF NOT EXISTS idx_sales_customer  ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status    ON sales(status);
