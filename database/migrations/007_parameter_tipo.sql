-- =============================================================================
-- Migration 007: Add tipo column to parameters table
-- =============================================================================

ALTER TABLE parameters ADD COLUMN tipo TEXT NOT NULL DEFAULT '+';
