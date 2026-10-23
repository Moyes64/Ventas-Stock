import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { Database } from 'better-sqlite3'
import type { WebBanner, SaveWebBannerInput, WebBannersConfig } from './types'
import { compressImage, compressImageBuffer, imagesDir } from './service'

// Interruptor general de los banners (mismo esquema de archivo de config que
// "Acceso remoto", ver web-catalog-server/service.ts).
const CONFIG_FILENAME = 'web-banners-config.json'

interface WebBannerRow {
  id: number
  title: string
  subtitle: string
  badge: string
  fine_print: string
  theme: 'gold' | 'navy'
  image_filename: string | null
  link_type: 'none' | 'product' | 'category' | 'url'
  link_product_id: number | null
  link_category_id: number | null
  link_url: string
  button_text: string
  date_from: string | null
  date_to: string | null
  active: number
  sort_order: number
  created_at: string
  updated_at: string
  link_product_name: string | null
  link_product_visible: number | null
  link_product_price: number | null
  link_product_web_price: number | null
  link_product_compare_at_price: number | null
  link_product_image: string | null
  link_category_name: string | null
}

function mapBanner(r: WebBannerRow): WebBanner {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    badge: r.badge,
    finePrint: r.fine_print,
    theme: r.theme,
    imageFilename: r.image_filename,
    linkType: r.link_type,
    linkProductId: r.link_product_id,
    linkCategoryId: r.link_category_id,
    linkUrl: r.link_url,
    buttonText: r.button_text,
    dateFrom: r.date_from,
    dateTo: r.date_to,
    active: r.active === 1,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    linkProductName: r.link_product_name,
    linkProductUnavailable: r.link_type === 'product' && r.link_product_visible !== 1,
    linkProductPrice: r.link_product_price,
    linkProductWebPrice: r.link_product_web_price,
    linkProductCompareAtPrice: r.link_product_compare_at_price,
    linkProductImageFilename: r.link_type === 'product' ? r.link_product_image : null,
    linkCategoryName: r.link_category_name,
  }
}

const SELECT_BANNERS = `
  SELECT b.*,
         p.name AS link_product_name, wp.visible AS link_product_visible,
         p.price AS link_product_price, wp.web_price AS link_product_web_price,
         wp.compare_at_price AS link_product_compare_at_price,
         (SELECT filename FROM web_product_images
           WHERE product_id = b.link_product_id ORDER BY sort_order ASC LIMIT 1) AS link_product_image,
         c.name AS link_category_name
  FROM web_banners b
  LEFT JOIN products p        ON p.id = b.link_product_id
  LEFT JOIN web_products wp   ON wp.product_id = b.link_product_id
  LEFT JOIN web_categories c  ON c.id = b.link_category_id
`

export class WebBannersService {
  constructor(private readonly db: Database) {}

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILENAME)
  }

  getConfig(): WebBannersConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        return { enabled: true, ...(JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) as Partial<WebBannersConfig>) }
      }
    } catch {
      // fall through
    }
    return { enabled: true }
  }

  setEnabled(enabled: boolean): WebBannersConfig {
    const config = { ...this.getConfig(), enabled }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
    return config
  }

  list(): WebBanner[] {
    const rows = this.db
      .prepare(`${SELECT_BANNERS} ORDER BY b.sort_order ASC, b.id ASC`)
      .all() as WebBannerRow[]
    return rows.map(mapBanner)
  }

  get(id: number): WebBanner | null {
    const row = this.db.prepare(`${SELECT_BANNERS} WHERE b.id = ?`).get(id) as WebBannerRow | undefined
    return row ? mapBanner(row) : null
  }

  save(id: number | null, input: SaveWebBannerInput): WebBanner {
    if (!input.title.trim()) throw new Error('El título es obligatorio.')
    if (input.linkType === 'product' && !input.linkProductId) throw new Error('Elegí el producto al que lleva el banner.')
    if (input.linkType === 'category' && !input.linkCategoryId) throw new Error('Elegí la categoría a la que lleva el banner.')
    if (input.linkType === 'url' && !input.linkUrl.trim()) throw new Error('Completá el link del banner.')
    if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) {
      throw new Error('La fecha "desde" no puede ser posterior a la fecha "hasta".')
    }

    // Solo se guarda el destino que corresponde al tipo de link elegido, y sin
    // link no hay botón.
    const values = [
      input.title.trim(), input.subtitle.trim(), input.badge.trim(), input.finePrint.trim(), input.theme,
      input.linkType,
      input.linkType === 'product' ? input.linkProductId : null,
      input.linkType === 'category' ? input.linkCategoryId : null,
      input.linkType === 'url' ? input.linkUrl.trim() : '',
      input.linkType === 'none' ? '' : input.buttonText.trim(),
      input.dateFrom || null, input.dateTo || null,
      input.active ? 1 : 0, input.sortOrder,
    ]

    const offer = input.linkType === 'product' && input.linkProductId ? input.productOffer : undefined
    if (offer && offer.compareAtPrice !== null) {
      const now = offer.webPrice ?? (this.db.prepare('SELECT price FROM products WHERE id=?')
        .get(input.linkProductId) as { price: number } | undefined)?.price ?? 0
      if (offer.compareAtPrice <= now) {
        throw new Error(`El precio anterior tiene que ser mayor al precio de oferta ($ ${now.toFixed(2)}).`)
      }
    }

    return this.db.transaction(() => {
      if (offer) {
        this.db.prepare(`
          UPDATE web_products SET web_price=?, compare_at_price=?, updated_at=datetime('now','localtime')
          WHERE product_id=?
        `).run(offer.webPrice, offer.compareAtPrice, input.linkProductId)
      }
      return this.saveRow(id, values)
    })()
  }

  private saveRow(id: number | null, values: unknown[]): WebBanner {
    if (id) {
      this.db.prepare(`
        UPDATE web_banners SET
          title=?, subtitle=?, badge=?, fine_print=?, theme=?,
          link_type=?, link_product_id=?, link_category_id=?, link_url=?, button_text=?,
          date_from=?, date_to=?, active=?, sort_order=?,
          updated_at=datetime('now','localtime')
        WHERE id=?
      `).run(...values, id)
      return this.get(id)!
    }
    const result = this.db.prepare(`
      INSERT INTO web_banners (
        title, subtitle, badge, fine_print, theme,
        link_type, link_product_id, link_category_id, link_url, button_text,
        date_from, date_to, active, sort_order
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(...values)
    return this.get(result.lastInsertRowid as number)!
  }

  delete(id: number): void {
    this.removeImageFile(id)
    this.db.prepare('DELETE FROM web_banners WHERE id=?').run(id)
  }

  setImage(id: number, sourcePath: string): WebBanner {
    return this.persistImage(id, compressImage(sourcePath))
  }

  // Usado por el servidor LAN (carga desde la Mac): la imagen llega como bytes.
  setImageFromBuffer(id: number, buffer: Buffer): WebBanner {
    return this.persistImage(id, compressImageBuffer(buffer))
  }

  private persistImage(id: number, jpeg: Buffer): WebBanner {
    if (!this.get(id)) throw new Error('El banner no existe.')
    this.removeImageFile(id)
    // Nombre nuevo en cada carga: el hosting lo trata como un archivo nuevo y
    // la web no muestra una versión cacheada de la imagen anterior.
    const filename = `banner_${id}_${Date.now()}.jpg`
    fs.writeFileSync(path.join(imagesDir(), filename), jpeg)
    this.db.prepare(`UPDATE web_banners SET image_filename=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(filename, id)
    return this.get(id)!
  }

  removeImage(id: number): WebBanner {
    this.removeImageFile(id)
    this.db.prepare(`UPDATE web_banners SET image_filename=NULL, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(id)
    return this.get(id)!
  }

  getNextSortOrder(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS mx FROM web_banners').get() as { mx: number }
    return row.mx + 1
  }

  private removeImageFile(id: number): void {
    const row = this.db.prepare('SELECT image_filename FROM web_banners WHERE id=?').get(id) as
      { image_filename: string | null } | undefined
    if (!row?.image_filename) return
    const filePath = path.join(imagesDir(), row.image_filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
}
