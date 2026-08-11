-- =============================================================================
-- Migration 028: Cargos adicionales (envío / recargo tarjeta) en ventas web
-- =============================================================================
-- Las ventas importadas de la tienda web (processWebOrder) guardan `total` ya
-- con el costo de envío y/o el recargo por tarjeta de crédito incluidos, pero
-- `sale_items` solo tiene los productos -- la suma de los ítems nunca coincide
-- con el total, y el comprobante impreso/emailado no explica la diferencia.
--
-- Estas dos columnas guardan ese cargo adicional (ya sumado en `total`) por
-- separado, con una etiqueta legible, para poder imprimirlo como una línea
-- propia. Quedan en 0 / '' para cualquier venta que no sea de la tienda web
-- (ventas de mostrador nunca las tocan).

ALTER TABLE sales ADD COLUMN other_charges_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN other_charges_label TEXT NOT NULL DEFAULT '';
