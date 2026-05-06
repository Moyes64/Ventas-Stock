-- =============================================================================
-- Migration 009: Caja (cash register) module
-- =============================================================================

-- Payment method for each sale (only contado_efectivo counts toward caja balance)
ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'contado_efectivo'
  CHECK(payment_method IN ('contado_efectivo', 'transferencia', 'debito', 'credito'));

-- Daily cash register sessions (apertura / cierre)
CREATE TABLE IF NOT EXISTS cash_register_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_date    TEXT    NOT NULL UNIQUE,          -- Date of the session (YYYY-MM-DD)
  apertura_amount REAL    NOT NULL DEFAULT 0,       -- Opening cash amount
  cierre_amount   REAL,                             -- Closing cash amount (NULL = still open)
  status          TEXT    NOT NULL DEFAULT 'open'
                  CHECK(status IN ('open', 'closed')),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Cash movements (ingresos / egresos) recorded during the day
CREATE TABLE IF NOT EXISTS cash_movements (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER REFERENCES cash_register_sessions(id) ON DELETE SET NULL,
  descripcion      TEXT    NOT NULL,
  tipo             TEXT    NOT NULL CHECK(tipo IN ('ingreso', 'egreso')),
  monto            REAL    NOT NULL,
  movimiento_date  TEXT    NOT NULL DEFAULT (date('now')),
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_date    ON cash_movements(movimiento_date);
