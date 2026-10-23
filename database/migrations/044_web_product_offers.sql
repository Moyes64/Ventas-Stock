-- =============================================================================
-- Migration 044: Ofertas con vencimiento en los productos web
-- =============================================================================
-- Hasta ahora la oferta de un banner se guardaba pisando web_price (el precio
-- web "normal" del producto) y no vencía nunca. Ahora la oferta es aparte:
--   offer_price           precio de oferta (null = sin precio de oferta)
--   offer_from/offer_to   vigencia YYYY-MM-DD (null = sin límite)
-- El precio que se muestra y se cobra lo decide Hostinger según la fecha de
-- Argentina (applyOffer() en hostinger/api/db.php), así la oferta vence aunque
-- la notebook esté apagada. Fuera de vigencia: precio normal y sin tachado.

ALTER TABLE web_products ADD COLUMN offer_price REAL;
ALTER TABLE web_products ADD COLUMN offer_from TEXT;
ALTER TABLE web_products ADD COLUMN offer_to TEXT;

-- Ofertas ya cargadas desde un banner de producto (web_price + tachado): se
-- pasan a precio de oferta con la vigencia del banner, y el producto vuelve a
-- usar el precio del catálogo como precio normal.
UPDATE web_products
SET offer_price = web_price,
    offer_from  = (SELECT b.date_from FROM web_banners b
                    WHERE b.link_type = 'product' AND b.link_product_id = web_products.product_id
                    ORDER BY b.active DESC, b.id DESC LIMIT 1),
    offer_to    = (SELECT b.date_to FROM web_banners b
                    WHERE b.link_type = 'product' AND b.link_product_id = web_products.product_id
                    ORDER BY b.active DESC, b.id DESC LIMIT 1),
    web_price   = NULL
WHERE web_price IS NOT NULL
  AND compare_at_price IS NOT NULL
  AND product_id IN (SELECT link_product_id FROM web_banners WHERE link_type = 'product');
