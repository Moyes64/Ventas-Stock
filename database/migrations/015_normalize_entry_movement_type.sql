-- =============================================================================
-- Migration 015: Normalize legacy stock_movements.type values
-- =============================================================================
-- El escáner de remitos guardaba erróneamente type='entrada' en vez de 'ENTRY'.
-- Se normalizan los registros históricos para que los reportes que filtran
-- por type='ENTRY' los incluyan correctamente.

UPDATE stock_movements SET type = 'ENTRY' WHERE type = 'entrada';
