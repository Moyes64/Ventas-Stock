import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { LabelConfig } from './types'
import { DEFAULT_LABEL_CONFIG } from './types'

const CONFIG_FILENAME = 'label-config.json'

export class LabelConfigService {
  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILENAME)
  }

  get(): LabelConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const saved = JSON.parse(raw) as Partial<LabelConfig>
        return { ...DEFAULT_LABEL_CONFIG, ...saved }
      }
    } catch { /* fall through */ }
    return { ...DEFAULT_LABEL_CONFIG }
  }

  save(config: LabelConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }
}
