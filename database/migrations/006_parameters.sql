-- =============================================================================
-- Migration 006: Create parameters table
-- =============================================================================

CREATE TABLE IF NOT EXISTS parameters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  descripcion TEXT    NOT NULL,
  porcentaje  REAL    NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
