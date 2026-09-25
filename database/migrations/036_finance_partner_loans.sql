-- =============================================================================
-- Migration 036: Préstamos a socios / aportes de socios y sus devoluciones
-- =============================================================================
-- Mientras el negocio no reparte utilidades, la plata que un socio saca para
-- cubrir una necesidad puntual es un PRÉSTAMO que después devuelve (no un
-- "Retiro de Socio", que queda reservado para el reparto real de ganancias).
-- Simétricamente, un "Aporte de Socio" puede ser plata que el negocio le
-- devuelve más adelante.
--
-- La devolución es un movimiento más (ingreso "Devolución de Préstamo" /
-- egreso "Devolución de Aporte") vinculado al original por
-- related_movement_id. Se admiten varias devoluciones parciales (cuotas) por
-- cada original; el saldo pendiente se calcula como original − Σ devoluciones.
--
-- Ninguno de estos cuatro movimientos es resultado del negocio: no suman ni
-- restan a la utilidad del patrimonio de socios (ver FinanceService.getPartnersEquity).

ALTER TABLE finance_movements ADD COLUMN related_movement_id INTEGER REFERENCES finance_movements(id);

CREATE INDEX IF NOT EXISTS idx_finance_movements_related ON finance_movements(related_movement_id);

INSERT INTO finance_categories (name, applies_to)
SELECT 'Préstamo a Socio', 'egreso'
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE name = 'Préstamo a Socio');

INSERT INTO finance_categories (name, applies_to)
SELECT 'Devolución de Préstamo', 'ingreso'
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE name = 'Devolución de Préstamo');

INSERT INTO finance_categories (name, applies_to)
SELECT 'Devolución de Aporte', 'egreso'
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE name = 'Devolución de Aporte');
