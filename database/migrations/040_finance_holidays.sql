-- =============================================================================
-- Migration 040: Feriados nacionales
-- =============================================================================
-- Días no hábiles además de sábados y domingos. Los usa el cálculo del "día
-- hábil siguiente" (acreditación de cobros FISERV en MP-Anabella), así una venta
-- del viernes anterior a un fin de semana largo acredita el primer día hábil
-- real y no el feriado.
--
-- Los feriados puente y los trasladables se fijan por decreto cada año, así que
-- se mantienen a mano desde Finanzas > Feriados. Se precarga el calendario
-- nacional 2026.

CREATE TABLE IF NOT EXISTS finance_holidays (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha       TEXT    NOT NULL UNIQUE,
  descripcion TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO finance_holidays (fecha, descripcion) VALUES
  ('2026-01-01', 'Año Nuevo'),
  ('2026-02-16', 'Carnaval'),
  ('2026-02-17', 'Carnaval'),
  ('2026-03-23', 'Feriado puente'),
  ('2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia'),
  ('2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-05-01', 'Día del Trabajador'),
  ('2026-05-25', 'Día de la Revolución de Mayo'),
  ('2026-06-15', 'Paso a la Inmortalidad del Gral. Martín Miguel de Güemes (trasladado)'),
  ('2026-06-20', 'Paso a la Inmortalidad del Gral. Manuel Belgrano'),
  ('2026-07-09', 'Día de la Independencia'),
  ('2026-07-10', 'Feriado puente'),
  ('2026-08-17', 'Paso a la Inmortalidad del Gral. José de San Martín'),
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural'),
  ('2026-11-23', 'Día de la Soberanía Nacional (trasladado)'),
  ('2026-12-07', 'Feriado puente'),
  ('2026-12-08', 'Inmaculada Concepción de María'),
  ('2026-12-25', 'Navidad');
