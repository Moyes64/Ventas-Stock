-- =============================================================================
-- Migration 047: Configuración compartida del sistema (clave → valor)
-- Con la base en la nube varias PCs la comparten; acá vive lo que tiene que
-- ser igual para todas, empezando por cuál es la PC principal.
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
