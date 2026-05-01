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
      .prepare('SELECT * FROM users WHERE username = ? AND active = 1')
      .get(username) as UserRow | undefined
    return row ? this.mapRow(row) : undefined
  }

  list(): User[] {
    const rows = this.db
      .prepare('SELECT * FROM users ORDER BY name ASC')
      .all() as UserRow[]
    return rows.map(r => this.mapRow(r))
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

  list(): Role[] {
    const rows = this.db.prepare('SELECT * FROM roles ORDER BY name ASC').all() as RoleRow[]
    return rows.map(r => this.mapRow(r))
  }

  getPermissions(roleId: number): Permission[] {
    return this.db
      .prepare('SELECT * FROM permissions WHERE role_id = ?')
      .all(roleId) as Permission[]
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
