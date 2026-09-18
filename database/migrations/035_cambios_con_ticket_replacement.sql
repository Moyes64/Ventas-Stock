-- =============================================================================
-- Migration 035: Cambios "con ticket" — permite que el cliente se lleve un
-- producto de reemplazo, igual que en "sin ticket". Si hay reemplazo, la
-- diferencia entre el monto devuelto (del ticket) y el total del producto
-- nuevo se salda igual que en free_exchanges: en efectivo desde Caja si
-- favorece al cliente, o con el medio elegido (o crédito de cliente) si
-- favorece al comercio. Sin reemplazo, el comportamiento no cambia.
-- =============================================================================

ALTER TABLE exchanges ADD COLUMN new_product_id INTEGER REFERENCES products(id);
ALTER TABLE exchanges ADD COLUMN new_quantity INTEGER;
ALTER TABLE exchanges ADD COLUMN new_unit_price REAL;
ALTER TABLE exchanges ADD COLUMN new_total REAL;
-- new_total - amount. Positivo = paga el cliente, negativo = se le devuelve, 0/NULL = sin reemplazo o sin diferencia.
ALTER TABLE exchanges ADD COLUMN difference REAL NOT NULL DEFAULT 0;
ALTER TABLE exchanges ADD COLUMN settlement_method TEXT;
ALTER TABLE exchanges ADD COLUMN finance_movement_id INTEGER REFERENCES finance_movements(id);
