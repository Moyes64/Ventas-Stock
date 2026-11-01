-- =============================================================================
-- Migration 046: Quién hizo cada operación
-- sales, stock_movements y free_exchanges ya tenían user_id (hasta ahora
-- quedaba vacío). Se agrega donde faltaba. NULL = lo hizo el sistema (p. ej.
-- la sincronización automática con la web) o es anterior al login.
-- =============================================================================

ALTER TABLE finance_movements ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE finance_transfers ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE exchanges ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE customer_credits ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE cash_register_sessions ADD COLUMN opened_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE cash_register_sessions ADD COLUMN closed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
