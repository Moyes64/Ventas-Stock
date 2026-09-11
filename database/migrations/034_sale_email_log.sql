-- =============================================================================
-- Migration 034: Log de emails de facturas enviados por SMTP
-- =============================================================================
-- El envío de facturas por email (electron/ipc/mail.handlers.ts) usa SMTP
-- directo vía nodemailer, no el cliente de correo del usuario. Por eso nunca
-- queda copia en la carpeta "Enviados" de ningún webmail/cliente de correo:
-- esa copia la genera el propio cliente con un IMAP APPEND después de
-- mandar, algo que un proceso SMTP externo como este nunca hace. Sin este
-- registro no había forma de saber qué se mandó, a quién, ni si falló.

CREATE TABLE sale_email_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id    INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  to_email   TEXT    NOT NULL,
  bcc_email  TEXT,
  subject    TEXT    NOT NULL,
  status     TEXT    NOT NULL CHECK(status IN ('sent','error')),
  error      TEXT,
  sent_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_sale_email_log_sale ON sale_email_log(sale_id);
