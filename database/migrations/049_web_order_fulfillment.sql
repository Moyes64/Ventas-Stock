-- =============================================================================
-- Migration 049: Seguimiento de la entrega de los pedidos web
-- pending   → pagado e importado, falta prepararlo
-- ready     → facturado y avisado al cliente que está listo para retirar
-- shipped   → facturado y avisado al cliente que se despachó
-- delivered → entregado / retirado (solo control interno, no manda mail)
-- delivery_type/delivery_address se guardan del pedido: antes se deducía el
-- tipo de entrega de la dirección del cliente, que puede venir de una compra
-- anterior con envío.
-- =============================================================================

ALTER TABLE web_orders_processed ADD COLUMN delivery_type TEXT;
ALTER TABLE web_orders_processed ADD COLUMN delivery_address TEXT;
ALTER TABLE web_orders_processed ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE web_orders_processed ADD COLUMN notified_at TEXT;
ALTER TABLE web_orders_processed ADD COLUMN delivered_at TEXT;

-- Los pedidos anteriores ya se entregaron: no deben aparecer como pendientes.
UPDATE web_orders_processed SET fulfillment_status = 'delivered';
