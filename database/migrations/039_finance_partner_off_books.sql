-- =============================================================================
-- Migration 039: Operaciones de socios fuera de las cuentas de Pandora
-- =============================================================================
-- Dos situaciones donde la plata NO pasa por ninguna cuenta del negocio, pero
-- igual tiene que quedar registrada:
--
--   1. Pago directo de un socio: el socio le paga a un proveedor (u otro gasto)
--      desde su cuenta personal. Es un aporte del socio + un egreso del negocio.
--   2. Compensación entre socios: un socio le paga a otro, de su bolsillo, parte
--      de un aporte pendiente. Pandora le pasa a deber ese monto al que pagó en
--      lugar del que había aportado.
--
-- Ambas se registran como un PAR de movimientos (ingreso + egreso del mismo
-- monto) en una cuenta especial de tipo 'socios' que siempre queda en cero y
-- no se muestra en los saldos. Así se reusan tal cual los aportes, sus
-- devoluciones en cuotas y el patrimonio por socio. pair_movement_id une las
-- dos mitades del par (cada una apunta a la otra) para borrarlas juntas.
--
--   1. Recrea finance_accounts para admitir type = 'socios'.
--   2. Crea la cuenta "Socios (fuera de Pandora)".
--   3. Agrega finance_movements.pair_movement_id.

CREATE TABLE finance_accounts_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL CHECK(type IN ('efectivo', 'mercadopago', 'banco', 'socios')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO finance_accounts_new (id, name, type, active, created_at)
SELECT id, name, type, active, created_at FROM finance_accounts;

DROP TABLE finance_accounts;
ALTER TABLE finance_accounts_new RENAME TO finance_accounts;

INSERT INTO finance_accounts (name, type)
SELECT 'Socios (fuera de Pandora)', 'socios'
WHERE NOT EXISTS (SELECT 1 FROM finance_accounts WHERE type = 'socios');

-- Sin REFERENCES a propósito: las dos mitades se apuntan entre sí y se borran juntas.
ALTER TABLE finance_movements ADD COLUMN pair_movement_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_finance_movements_pair ON finance_movements(pair_movement_id);
