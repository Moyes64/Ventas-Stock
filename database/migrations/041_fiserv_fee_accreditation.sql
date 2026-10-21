-- =============================================================================
-- Migration 041: Comisión FISERV pendiente junto con su cobro
-- =============================================================================
-- El cobro FISERV entra a MP-Anabella como ingreso pendiente de acreditación
-- (día hábil siguiente), pero la comisión se grababa sin fecha de acreditación y
-- descontaba del saldo en el momento. Ahora la comisión lleva la misma
-- fecha_acreditacion que su ingreso; acá se completa para las ya registradas.

UPDATE finance_movements AS fee
SET fecha_acreditacion = (
  SELECT inc.fecha_acreditacion
  FROM finance_movements inc
  WHERE inc.tipo = 'ingreso'
    AND inc.account_id = fee.account_id
    AND inc.fecha_acreditacion IS NOT NULL
    AND (
      (fee.sale_payment_id IS NOT NULL AND inc.sale_payment_id = fee.sale_payment_id)
      OR (fee.sale_payment_id IS NULL AND fee.sale_id IS NOT NULL AND inc.sale_id = fee.sale_id)
      OR (fee.sale_id IS NULL AND inc.sale_id IS NULL AND fee.descripcion LIKE '% - ' || inc.descripcion)
    )
  ORDER BY inc.id
  LIMIT 1
)
WHERE fee.tipo = 'egreso'
  AND fee.fecha_acreditacion IS NULL
  AND fee.categoria_id = (SELECT id FROM finance_categories WHERE name = 'Comisión FISERV');
