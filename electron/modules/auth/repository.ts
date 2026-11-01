import type { Database } from 'better-sqlite3'
import type { User, Role, Permission } from './types'

interface UserRow {
  id: number
  username: string
  password_hash: string
  name: string
  role_id: number
  active: number
  created_at: string
  updated_at: string
}

interface RoleRow {
  id: number
  name: string
  description: string
  created_at: string
}

interface PermissionRow {
  id: number
  role_id: number
  module: string
  action: string
}

export class UserRepository {
  constructor(private readonly db: Database) {}

  findById(id: number): (User & { passwordHash: string }) | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as UserRow | undefined
    return row ? this.mapRow(row) : undefined
  }

  findByUsername(username: string): (User & { passwordHash: string }) | undefined {
    const row = this.db
      // El usuario no distingue mayúsculas ("anabella" = "Anabella"); la clave sí.
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND active = 1')
      .get(username) as UserRow | undefined
    return row ? this.mapRow(row) : undefined
  }

  /** ¿Ya hay un usuario (activo o no) con ese nombre, sin distinguir mayúsculas? */
  usernameExists(username: string): boolean {
    return !!this.db
      .prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE')
      .get(username)
  }

  list(): User[] {
    const rows = this.db
      .prepare('SELECT * FROM users ORDER BY name ASC')
      .all() as UserRow[]
    return rows.map(r => this.mapRow(r))
  }

  /** Operaciones registradas a nombre del usuario (ventas, stock, finanzas, caja, cambios). */
  countOperations(userId: number): number {
    const row = this.db
      .prepare(
        `SELECT
           (SELECT count(*) FROM sales WHERE user_id = @id) +
           (SELECT count(*) FROM stock_movements WHERE user_id = @id) +
           (SELECT count(*) FROM finance_movements WHERE user_id = @id) +
           (SELECT count(*) FROM finance_transfers WHERE user_id = @id) +
           (SELECT count(*) FROM cash_register_sessions WHERE opened_by_user_id = @id OR closed_by_user_id = @id) +
           (SELECT count(*) FROM exchanges WHERE user_id = @id) +
           (SELECT count(*) FROM free_exchanges WHERE user_id = @id) +
           (SELECT count(*) FROM customer_credits WHERE user_id = @id) AS n`
      )
      .get({ id: userId }) as { n: number }
    return row.n
  }

  countActive(): number {
    return (this.db.prepare('SELECT count(*) AS n FROM users WHERE active = 1').get() as { n: number }).n
  }

  /** Usuarios activos con el rol indicado, sin contar `excludeId`. */
  countActiveWithRole(roleName: string, excludeId?: number): number {
    const row = this.db
      .prepare(
        `SELECT count(*) AS n FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.active = 1 AND r.name = ? AND u.id != ?`
      )
      .get(roleName, excludeId ?? 0) as { n: number }
    return row.n
  }

  create(data: {
    username: string
    passwordHash: string
    name: string
    roleId: number
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO users (username, password_hash, name, role_id)
         VALUES (@username, @passwordHash, @name, @roleId)`
      )
      .run({
        username: data.username,
        passwordHash: data.passwordHash,
        name: data.name,
        roleId: data.roleId,
      })
    return result.lastInsertRowid as number
  }

  update(
    id: number,
    data: Partial<{ name: string; roleId: number; active: boolean; passwordHash: string }>
  ): void {
    const fields: string[] = []
    const params: Record<string, unknown> = { id }

    if (data.name !== undefined) { fields.push('name = @name'); params.name = data.name }
    if (data.roleId !== undefined) { fields.push('role_id = @roleId'); params.roleId = data.roleId }
    if (data.active !== undefined) { fields.push('active = @active'); params.active = data.active ? 1 : 0 }
    if (data.passwordHash !== undefined) { fields.push('password_hash = @passwordHash'); params.passwordHash = data.passwordHash }

    if (fields.length === 0) return
    fields.push("updated_at = datetime('now')")

    this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = @id`).run(params)
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id)
  }

  private mapRow(row: UserRow): User & { passwordHash: string } {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      name: row.name,
      roleId: row.role_id,
      active: row.active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

export class RoleRepository {
  constructor(private readonly db: Database) {}

  findById(id: number): Role | undefined {
    const row = this.db
      .prepare('SELECT * FROM roles WHERE id = ?')
      .get(id) as RoleRow | undefined
    if (!row) return undefined

    const permissions = this.db
      .prepare('SELECT * FROM permissions WHERE role_id = ?')
      .all(id) as PermissionRow[]

    return this.mapRow(row, permissions)
  }

  findByName(name: string): Role | undefined {
    const row = this.db.prepare('SELECT * FROM roles WHERE name = ?').get(name) as RoleRow | undefined
    return row ? this.mapRow(row) : undefined
  }

  list(): Role[] {
    const rows = this.db.prepare('SELECT * FROM roles ORDER BY name ASC').all() as RoleRow[]
    return rows.map(r => this.mapRow(r))
  }

  getPermissions(roleId: number): Permission[] {
    return this.db
      .prepare('SELECT * FROM permissions WHERE role_id = ?')
      .all(roleId) as Permission[]
  }

  /** Roles con sus permisos y cuántos usuarios tienen cada uno. */
  listWithPermissions(): Array<Role & { userCount: number }> {
    const rows = this.db
      .prepare(
        `SELECT r.*, (SELECT count(*) FROM users u WHERE u.role_id = r.id) AS user_count
         FROM roles r ORDER BY r.name ASC`
      )
      .all() as Array<RoleRow & { user_count: number }>
    const permissions = this.db.prepare('SELECT * FROM permissions').all() as PermissionRow[]
    return rows.map(r => ({
      ...this.mapRow(r, permissions.filter(p => p.role_id === r.id)),
      userCount: r.user_count,
    }))
  }

  create(data: { name: string; description: string }): number {
    const result = this.db
      .prepare('INSERT INTO roles (name, description) VALUES (@name, @description)')
      .run(data)
    return result.lastInsertRowid as number
  }

  update(id: number, data: { name: string; description: string }): void {
    this.db
      .prepare('UPDATE roles SET name = @name, description = @description WHERE id = @id')
      .run({ id, ...data })
  }

  /** Reemplaza las secciones a las que accede el rol. */
  setAccess(roleId: number, modules: string[], action: string): void {
    const insert = this.db.prepare(
      'INSERT INTO permissions (role_id, module, action) VALUES (@roleId, @module, @action)'
    )
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM permissions WHERE role_id = ?').run(roleId)
      for (const module of modules) insert.run({ roleId, module, action })
    })()
  }

  countUsers(roleId: number): number {
    return (this.db.prepare('SELECT count(*) AS n FROM users WHERE role_id = ?').get(roleId) as { n: number }).n
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM roles WHERE id = ?').run(id)
  }

  private mapRow(row: RoleRow, permissions: PermissionRow[] = []): Role {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      permissions: permissions.map(p => ({
        id: p.id,
        roleId: p.role_id,
        module: p.module,
        action: p.action,
      })),
    }
  }
}
