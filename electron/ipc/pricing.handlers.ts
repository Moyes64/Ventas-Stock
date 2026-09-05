import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { PricingService } from '../modules/pricing/service'
import type {
  CreateFixedCostInput,
  UpdateFixedCostInput,
  PricingSettings,
  PricingSimulationParams,
} from '../modules/pricing/types'

export function registerPricingHandlers(db: Database): void {
  const pricingService = new PricingService(db)

  // Costos fijos manuales
  ipcMain.handle('pricing:listFixedCosts', () => {
    return pricingService.listFixedCosts()
  })

  ipcMain.handle('pricing:createFixedCost', (_event, input: CreateFixedCostInput) => {
    return pricingService.createFixedCost(input)
  })

  ipcMain.handle('pricing:updateFixedCost', (_event, id: number, input: UpdateFixedCostInput) => {
    return pricingService.updateFixedCost(id, input)
  })

  ipcMain.handle('pricing:deleteFixedCost', (_event, id: number) => {
    return pricingService.deleteFixedCost(id)
  })

  // Configuración
  ipcMain.handle('pricing:getSettings', () => {
    return pricingService.getSettings()
  })

  ipcMain.handle('pricing:saveSettings', (_event, input: PricingSettings) => {
    return pricingService.saveSettings(input)
  })

  // Simulación
  ipcMain.handle('pricing:simulate', (_event, params: PricingSimulationParams) => {
    return pricingService.simulate(params)
  })

  ipcMain.handle('pricing:applyPrice', (_event, productId: number, precio: number) => {
    return pricingService.applyPrice(productId, precio)
  })

  // Margen objetivo individual por producto (fabricación propia)
  ipcMain.handle('pricing:setProductMargin', (_event, productId: number, margenObjetivo: number) => {
    return pricingService.setProductMargin(productId, margenObjetivo)
  })

  ipcMain.handle('pricing:clearProductMargin', (_event, productId: number) => {
    return pricingService.clearProductMargin(productId)
  })
}
