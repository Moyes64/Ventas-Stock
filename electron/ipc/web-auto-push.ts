import { getSyncService } from './sync.handlers'

/**
 * Canales que cambian algo que se ve en la web (catálogo, catálogo web,
 * banners, precios, stock). Cuando uno termina bien, la PC donde se hizo el
 * cambio sube la web sola unos segundos después — así no hace falta esperar a
 * la sincronización periódica de la PC principal ni apretar "Sincronizar ahora".
 */
const WEB_CHANGING_CHANNELS = new Set([
  'catalog:createProduct',
  'catalog:updateProduct',
  'catalog:deleteProduct',
  'catalog:hardDeleteProduct',
  'webCatalog:saveCategory',
  'webCatalog:deleteCategory',
  'webCatalog:saveProduct',
  'webCatalog:uploadImage',
  'webCatalog:deleteImage',
  'webCatalog:reorderImages',
  'webCatalog:setBannersEnabled',
  'webCatalog:saveBanner',
  'webCatalog:deleteBanner',
  'webCatalog:uploadBannerImage',
  'webCatalog:removeBannerImage',
  'pricing:applyPrice',
  'priceUpdate:applyUpdates',
  'stock:addMovement',
  'stock:deleteMovement',
])

/** Lo llama el control de acceso con el resultado de cada pedido. */
export function afterChannel(channel: string, result: unknown): void {
  if (!WEB_CHANGING_CHANNELS.has(channel)) return
  Promise.resolve(result).then(
    () => {
      try {
        getSyncService()?.scheduleAutoPush()
      } catch (err) {
        console.warn('[sync] No se pudo programar la subida automática:', err)
      }
    },
    () => { /* el pedido falló: no hay nada nuevo que subir */ },
  )
}
