-- =============================================================================
-- Migration 020: Fecha fundacional de Finanzas
-- =============================================================================
-- A partir de esta fecha arranca la contabilidad societaria desde cero (los
-- socios cerraron cuentas y repartieron lo acumulado). Todo lo anterior queda
-- en la base como historial, pero Finanzas no vuelve a sumarlo ni mostrarlo.

CREATE TABLE IF NOT EXISTS finance_settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  founding_date TEXT NOT NULL
);

INSERT INTO finance_settings (id, founding_date) VALUES (1, '2026-08-01');
