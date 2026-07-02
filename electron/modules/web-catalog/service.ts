import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { Database } from 'better-sqlite3'
import type {
  WebCategory,
  WebProduct,
  WebProductImage,
  SaveWebProductInput,
  SaveWebCategoryInput,
} from './types'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function imagesDir(): string {
  const dir = path.join(app.getPath('userData'), 'web-images')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

interface WebCategoryRow {
  id: number
  name: string
  slug: string
  description: string
  sort_order: number
  active: number
  created_at: string
  updated_at: string
}

interface WebProductRow {
  id: number
  product_id: number
  web_category_id: number | null
  visible: number
  featured: number
  web_price: number | null
  short_description: string
  long_description: string
  age_min: number | null
  players_min: number | null
  players_max: number | null
  play_time_min: number | null
  difficulty: number | null
  video_url: string
  tags: string
  sort_order: number
  created_at: string
  updated_at: string
  product_name: string
  product_price: number
  product_stock: number
  product_sku: string
}

interface WebImageRow {
  id: number
  product_id: number
  filename: string
  sort_order: number
  created_at: string
}

function mapCategory(r: WebCategoryRow): WebCategory {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    sortOrder: r.sort_order,
    active: r.active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapProduct(r: WebProductRow, images: WebProductImage[]): WebProduct {
  return {
    id: r.id,
    productId: r.product_id,
    webCategoryId: r.web_category_id,
    visible: r.visible === 1,
    featured: r.featured === 1,
    webPrice: r.web_price,
    shortDescription: r.short_description,
    longDescription: r.long_description,
    ageMin: r.age_min,
    playersMin: r.players_min,
    playersMax: r.players_max,
    playTimeMin: r.play_time_min,
    difficulty: r.difficulty,
    videoUrl: r.video_url,
    tags: r.tags,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    productName: r.product_name,
    productPrice: r.product_price,
    productStock: r.product_stock,
    productSku: r.product_sku,
    images,
  }
}

export class WebCatalogService {
  constructor(private readonly db: Database) {}

  // ── Categorías ────────────────────────────────────────────────────────────

  listCategories(): WebCategory[] {
    const rows = this.db
      .prepare('SELECT * FROM web_categories ORDER BY sort_order ASC, name ASC')
      .all() as WebCategoryRow[]
    return rows.map(mapCategory)
  }

  saveCategory(id: number | null, input: SaveWebCategoryInput): WebCategory {
    const slug = slugify(input.name)
    if (id) {
      this.db.prepare(`
        UPDATE web_categories SET name=?, slug=?, description=?, sort_order=?, active=?,
          updated_at=datetime('now','localtime')
        WHERE id=?
      `).run(input.name, slug, input.description, input.sortOrder, input.active ? 1 : 0, id)
      return mapCategory(this.db.prepare('SELECT * FROM web_categories WHERE id=?').get(id) as WebCategoryRow)
    }
    const result = this.db.prepare(`
      INSERT INTO web_categories (name, slug, description, sort_order, active)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.name, slug, input.description, input.sortOrder, input.active ? 1 : 0)
    return mapCategory(this.db.prepare('SELECT * FROM web_categories WHERE id=?').get(result.lastInsertRowid) as WebCategoryRow)
  }

  deleteCategory(id: number): void {
    this.db.prepare('UPDATE web_products SET web_category_id=NULL WHERE web_category_id=?').run(id)
    this.db.prepare('DELETE FROM web_categories WHERE id=?').run(id)
  }

  // ── Productos web ─────────────────────────────────────────────────────────

  listWebProducts(): WebProduct[] {
    const rows = this.db.prepare(`
      SELECT wp.*,
             p.name AS product_name, p.price AS product_price,
             p.stock_quantity AS product_stock, p.sku AS product_sku
      FROM web_products wp
      JOIN products p ON p.id = wp.product_id
      ORDER BY wp.sort_order ASC, p.name ASC
    `).all() as WebProductRow[]

    return rows.map(r => {
      const images = this.getImages(r.product_id)
      return mapProduct(r, images)
    })
  }

  getWebProduct(productId: number): WebProduct | null {
    const row = this.db.prepare(`
      SELECT wp.*,
             p.name AS product_name, p.price AS product_price,
             p.stock_quantity AS product_stock, p.sku AS product_sku
      FROM web_products wp
      JOIN products p ON p.id = wp.product_id
      WHERE wp.product_id = ?
    `).get(productId) as WebProductRow | undefined
    if (!row) return null
    return mapProduct(row, this.getImages(productId))
  }

  saveWebProduct(input: SaveWebProductInput): WebProduct {
    const existing = this.db
      .prepare('SELECT id FROM web_products WHERE product_id=?')
      .get(input.productId) as { id: number } | undefined

    if (existing) {
      this.db.prepare(`
        UPDATE web_products SET
          web_category_id=?, visible=?, featured=?, web_price=?,
          short_description=?, long_description=?, age_min=?, players_min=?,
          players_max=?, play_time_min=?, difficulty=?, video_url=?, tags=?,
          sort_order=?, updated_at=datetime('now','localtime')
        WHERE product_id=?
      `).run(
        input.webCategoryId, input.visible ? 1 : 0, input.featured ? 1 : 0,
        input.webPrice, input.shortDescription, input.longDescription,
        input.ageMin, input.playersMin, input.playersMax, input.playTimeMin,
        input.difficulty, input.videoUrl, input.tags, input.sortOrder,
        input.productId,
      )
    } else {
      this.db.prepare(`
        INSERT INTO web_products (
          product_id, web_category_id, visible, featured, web_price,
          short_description, long_description, age_min, players_min,
          players_max, play_time_min, difficulty, video_url, tags, sort_order
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        input.productId, input.webCategoryId, input.visible ? 1 : 0, input.featured ? 1 : 0,
        input.webPrice, input.shortDescription, input.longDescription,
        input.ageMin, input.playersMin, input.playersMax, input.playTimeMin,
        input.difficulty, input.videoUrl, input.tags, input.sortOrder,
      )
    }
    return this.getWebProduct(input.productId)!
  }

  // ── Imágenes ──────────────────────────────────────────────────────────────

  getImages(productId: number): WebProductImage[] {
    const rows = this.db
      .prepare('SELECT * FROM web_product_images WHERE product_id=? ORDER BY sort_order ASC')
      .all(productId) as WebImageRow[]
    return rows.map(r => ({
      id: r.id,
      productId: r.product_id,
      filename: r.filename,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
    }))
  }

  saveImage(productId: number, sourcePath: string, sortOrder: number): WebProductImage {
    const ext = path.extname(sourcePath).toLowerCase() || '.jpg'
    const filename = `${productId}_${Date.now()}${ext}`
    const dest = path.join(imagesDir(), filename)
    fs.copyFileSync(sourcePath, dest)

    const result = this.db.prepare(`
      INSERT INTO web_product_images (product_id, filename, sort_order) VALUES (?,?,?)
    `).run(productId, filename, sortOrder)

    return {
      id: result.lastInsertRowid as number,
      productId,
      filename,
      sortOrder,
      createdAt: new Date().toISOString(),
    }
  }

  deleteImage(imageId: number): void {
    const row = this.db
      .prepare('SELECT filename FROM web_product_images WHERE id=?')
      .get(imageId) as { filename: string } | undefined
    if (row) {
      const filePath = path.join(imagesDir(), row.filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    this.db.prepare('DELETE FROM web_product_images WHERE id=?').run(imageId)
  }

  reorderImages(productId: number, orderedIds: number[]): void {
    const update = this.db.prepare('UPDATE web_product_images SET sort_order=? WHERE id=? AND product_id=?')
    const tx = this.db.transaction(() => {
      orderedIds.forEach((id, idx) => update.run(idx, id, productId))
    })
    tx()
  }

  getImagePath(filename: string): string {
    return path.join(imagesDir(), filename)
  }

  // ── Productos del catálogo aún no publicados en web ───────────────────────

  getNextSortOrder(webCategoryId: number | null): number {
    const row = (webCategoryId !== null
      ? this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS mx FROM web_products WHERE web_category_id = ?').get(webCategoryId)
      : this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS mx FROM web_products').get()
    ) as { mx: number }
    return row.mx + 1
  }

  listUnpublishedProducts(): Array<{ id: number; name: string; sku: string; price: number; stock: number; supplierId: number | null; supplierName: string | null }> {
    return (this.db.prepare(`
      SELECT p.id, p.name, p.sku, p.price, p.stock_quantity AS stock,
             p.supplier_id AS supplierId, s.name AS supplierName
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.active = 1
        AND p.id NOT IN (SELECT product_id FROM web_products)
      ORDER BY p.name ASC
    `).all() as Array<{ id: number; name: string; sku: string; price: number; stock: number; supplierId: number | null; supplierName: string | null }>)
  }
}
