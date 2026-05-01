import crypto from 'crypto'
import { getDb } from './db'

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 64 } as const

function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(plain, salt, SCRYPT_PARAMS.dkLen, SCRYPT_PARAMS).toString('hex')
  return `${salt}$${hash}`
}

/**
 * Seeds the database with:
 * - Admin user (admin / admin123)
 * - Sample product categories
 * - Sample products with IVA rates
 * - A sample customer (Consumidor Final)
 */
export function runSeed(): void {
  const db = getDb()

  // ------------------------------------------------------------------
  // Admin user
  // ------------------------------------------------------------------
  const adminRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('admin') as
    | { id: number }
    | undefined

  if (!adminRole) {
    console.warn('[seed] Role "admin" not found. Run migrations first.')
    return
  }

  const existingAdmin = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get('admin')

  if (!existingAdmin) {
    db.prepare(
      `INSERT INTO users (username, password_hash, name, role_id)
       VALUES (?, ?, ?, ?)`
    ).run('admin', hashPassword('admin123'), 'Administrador', adminRole.id)
    console.log('[seed] Created user: admin / admin123')
  }

  // ------------------------------------------------------------------
  // Categories
  // ------------------------------------------------------------------
  const categories = ['General', 'Bebidas', 'Alimentos', 'Limpieza', 'Electrónica']
  for (const cat of categories) {
    db.prepare(
      'INSERT OR IGNORE INTO categories (name) VALUES (?)'
    ).run(cat)
  }

  // ------------------------------------------------------------------
  // Products
  // ------------------------------------------------------------------
  const taxRate21 = db
    .prepare('SELECT id FROM tax_rates WHERE afip_code = 5')
    .get() as { id: number } | undefined
  const taxRate105 = db
    .prepare('SELECT id FROM tax_rates WHERE afip_code = 4')
    .get() as { id: number } | undefined
  const taxExento = db
    .prepare('SELECT id FROM tax_rates WHERE afip_code = 3')
    .get() as { id: number } | undefined

  const categoryGeneral = db
    .prepare('SELECT id FROM categories WHERE name = ?')
    .get('General') as { id: number } | undefined
  const categoryBebidas = db
    .prepare('SELECT id FROM categories WHERE name = ?')
    .get('Bebidas') as { id: number } | undefined
  const categoryAlimentos = db
    .prepare('SELECT id FROM categories WHERE name = ?')
    .get('Alimentos') as { id: number } | undefined

  if (taxRate21 && taxRate105 && taxExento && categoryGeneral && categoryBebidas && categoryAlimentos) {
    const products = [
      {
        sku: 'PROD-001',
        barcode: '7790001000016',
        name: 'Gaseosa Cola 500ml',
        price: 350.0,
        cost: 200.0,
        tax_rate_id: taxRate21.id,
        category_id: categoryBebidas.id,
        stock_quantity: 50,
        stock_min: 10,
      },
      {
        sku: 'PROD-002',
        barcode: '7790002000023',
        name: 'Pan de Molde',
        price: 420.0,
        cost: 280.0,
        tax_rate_id: taxRate105.id,
        category_id: categoryAlimentos.id,
        stock_quantity: 30,
        stock_min: 5,
      },
      {
        sku: 'PROD-003',
        barcode: '7790003000030',
        name: 'Cuaderno A4 x 96 hojas',
        price: 1200.0,
        cost: 700.0,
        tax_rate_id: taxRate21.id,
        category_id: categoryGeneral.id,
        stock_quantity: 20,
        stock_min: 3,
      },
    ]

    const insertProduct = db.prepare(`
      INSERT OR IGNORE INTO products
        (sku, barcode, name, price, cost, tax_rate_id, category_id, stock_quantity, stock_min)
      VALUES
        (@sku, @barcode, @name, @price, @cost, @tax_rate_id, @category_id, @stock_quantity, @stock_min)
    `)

    for (const p of products) {
      insertProduct.run(p)
      console.log(`[seed] Product: ${p.name}`)
    }
  }

  // ------------------------------------------------------------------
  // Sample customer: Consumidor Final
  // ------------------------------------------------------------------
  db.prepare(`
    INSERT OR IGNORE INTO customers (name, doc_type, condicion_iva)
    VALUES ('Consumidor Final', 'SIN_IDENTIFICAR', 'CONSUMIDOR_FINAL')
  `).run()
  console.log('[seed] Customer: Consumidor Final')

  console.log('[seed] Seed complete.')
}
