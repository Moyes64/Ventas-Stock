-- =============================================================================
-- Migration 008: Sale parameters (descuentos/recargos aplicados por venta)
-- =============================================================================

-- Net adjustment applied to the subtotal (positive = discount, negative = surcharge)
ALTER TABLE sales ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;

-- Stores which parameters were applied to each sale, snapshotting their values
-- so reprints remain correct even if the parameter is later edited/deleted.
CREATE TABLE IF NOT EXISTS sale_parameters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id       INTEGER NOT NULL,
  parameter_id  INTEGER,          -- nullable: source parameter may be deleted later
  descripcion   TEXT    NOT NULL,
  porcentaje    REAL    NOT NULL,
  tipo          TEXT    NOT NULL CHECK(tipo IN ('+', '-')),
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE INDEX IF NOT EXISTS idx_sale_parameters_sale_id ON sale_parameters(sale_id);
