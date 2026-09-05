-- =============================================================================
-- Migration 030: Módulo "Precio ideal de venta" (Pricing)
-- Costos fijos que el negocio paga hoy sin que pasen por finance_movements
-- (ej. alquiler pagado del bolsillo, todavía no formalizado en Finanzas), y
-- la última configuración usada en el simulador de precios, para no tener
-- que re-tipear los parámetros cada vez que se abre el módulo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pricing_fixed_costs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre         TEXT    NOT NULL,          -- ej. "Alquiler"
  monto_mensual  REAL    NOT NULL DEFAULT 0,
  activo         INTEGER NOT NULL DEFAULT 1,
  notas          TEXT    NOT NULL DEFAULT '',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS pricing_settings (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  margen_objetivo_a     REAL NOT NULL DEFAULT 30,
  margen_objetivo_b     REAL NOT NULL DEFAULT 30,
  margen_objetivo_c     REAL NOT NULL DEFAULT 30,
  pareto_corte_a_pct    REAL NOT NULL DEFAULT 55,
  pareto_corte_b_pct    REAL NOT NULL DEFAULT 80,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT INTO pricing_settings (id)
SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM pricing_settings WHERE id = 1);
