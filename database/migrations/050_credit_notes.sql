-- =============================================================================
-- Migration 050: Notas de crédito electrónicas (anulación de facturas con CAE)
-- Una nota de crédito anula por completo la factura de una venta: una sola por
-- venta. La venta queda CANCELLED y la NC guarda su propio número y CAE.
-- =============================================================================

CREATE TABLE IF NOT EXISTS credit_notes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id      INTEGER NOT NULL UNIQUE REFERENCES sales(id),
  invoice_type INTEGER NOT NULL,          -- 13 = NC C, 8 = NC B, 3 = NC A
  punto_venta  INTEGER NOT NULL,
  number       INTEGER NOT NULL,
  cae          TEXT    NOT NULL,
  cae_vto      TEXT,
  total        REAL    NOT NULL,
  issue_date   TEXT    NOT NULL,          -- YYYY-MM-DD (fecha del comprobante)
  reason       TEXT    NOT NULL DEFAULT '',
  user_id      INTEGER REFERENCES users(id),
  created_at   TEXT    NOT NULL
);

-- El alta de CAE guardaba punto_venta = 0 (la respuesta de AFIP no lo trae):
-- con NULL la impresión y el QR usan el punto de venta configurado.
UPDATE sales SET punto_venta = NULL WHERE punto_venta = 0;
