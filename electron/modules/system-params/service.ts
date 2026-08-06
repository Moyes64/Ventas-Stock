import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { SystemParams } from './types'
import { DEFAULT_SYSTEM_PARAMS } from './types'

const CONFIG_FILENAME = 'system-params.json'

export class SystemParamsService {
  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILENAME)
  }

  get(): SystemParams {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        return { ...DEFAULT_SYSTEM_PARAMS, ...(JSON.parse(raw) as Partial<SystemParams>) }
      }
    } catch {
      // fall through
    }
    return { ...DEFAULT_SYSTEM_PARAMS }
  }

  save(params: SystemParams): void {
    fs.writeFileSync(this.configPath, JSON.stringify(params, null, 2), 'utf-8')
  }
}
