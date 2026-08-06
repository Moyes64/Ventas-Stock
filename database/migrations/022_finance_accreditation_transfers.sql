-- =============================================================================
-- Migration 022: Fecha de acreditación diferida y transferencias entre cuentas
-- =============================================================================
-- Algunos ingresos (ej: ventas por Mercado Libre acreditadas en MP Ariel) se
-- efectivizan varios días después de la fecha de la operación. Este campo
-- opcional guarda esa fecha; hasta que llegue, el monto no se suma al saldo
-- disponible de la cuenta (ver FinanceService.getAccountBalances). NULL
-- significa "disponible de inmediato", que es el comportamiento previo.

ALTER TABLE finance_movements ADD COLUMN fecha_acreditacion TEXT;

CREATE INDEX IF NOT EXISTS idx_finance_movements_fecha_acreditacion
  ON finance_movements(fecha_acreditacion);

-- Movimientos de dinero entre las cuentas propias de la sociedad (no son
-- ingreso ni egreso: no afectan utilidad ni patrimonio de socios, solo mueven
-- saldo de una cuenta a otra).
CREATE TABLE IF NOT EXISTS finance_transfers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  from_account_id INTEGER NOT NULL REFERENCES finance_accounts(id),
  to_account_id   INTEGER NOT NULL REFERENCES finance_accounts(id),
  monto           REAL    NOT NULL CHECK(monto > 0),
  descripcion     TEXT,
  fecha           TEXT    NOT NULL DEFAULT (date('now')),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finance_transfers_fecha ON finance_transfers(fecha);
CREATE INDEX IF NOT EXISTS idx_finance_transfers_from  ON finance_transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_finance_transfers_to    ON finance_transfers(to_account_id);
