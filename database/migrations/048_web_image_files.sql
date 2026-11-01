-- =============================================================================
-- Migration 048: Fotos del catálogo web en la base compartida
-- Las fotos viven como archivo en la carpeta web-images de cada PC. Con la
-- base en la nube (Turso) además se guardan acá, así una foto cargada desde
-- cualquier PC le llega a la PC principal (que es la que las sube a la web) y
-- a las demás. Con la base local esta tabla queda vacía.
-- =============================================================================

CREATE TABLE IF NOT EXISTS web_image_files (
  filename   TEXT PRIMARY KEY,
  data       BLOB    NOT NULL,
  size       INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
