import crypto from 'crypto'
import type { Database } from 'better-sqlite3'
import { UserRepository, RoleRepository } from './repository'
import type { AuthenticatedUser, LoginRequest, LoginResult } from './types'
import { ACCESS_ACTION, ADMIN_ROLE, PERMISSION_AREAS } from './permissions'

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 64 } as const
// N=16384 (CPU/memory cost), r=8 (block size), p=1 (parallelism), dkLen=64 bytes output
// These are the RFC 7914 recommended values for interactive logins.

/** Returns a `salt$hash` string using scrypt. */
function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(plain, salt, SCRYPT_PARAMS.dkLen, SCRYPT_PARAMS).toString('hex')
  return `${salt}$${hash}`
}

/**
 * Verifies a password against a stored scrypt hash (`salt$hash`).
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifyPassword(plain: string, stored: string): boolean {
  const separatorIdx = stored.indexOf('$')
  if (separatorIdx === -1) return false
  const salt = stored.slice(0, separatorIdx)
  const expected = stored.slice(separatorIdx + 1)
  const actual = crypto.scryptSync(plain, salt, SCRYPT_PARAMS.dkLen, SCRYPT_PARAMS).toString('hex')
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

export class AuthService {
  private readonly userRepo: UserRepository
  private readonly roleRepo: RoleRepository

  constructor(db: Database) {
    this.userRepo = new UserRepository(db)
    this.roleRepo = new RoleRepository(db)
  }

  login(req: LoginRequest): LoginResult {
    // Mismo mensaje para usuario inexistente y clave incorrecta: no revela qué
    // usuarios existen.
    const user = this.userRepo.findByUsername(req.username.trim())
    if (!user || !verifyPassword(req.password, user.passwordHash)) {
      return { success: false, error: 'Usuario o contraseña incorrectos' }
    }

    if (!user.active) {
      return { success: false, error: 'Usuario inactivo' }
    }

    const role = this.roleRepo.findById(user.roleId)
    if (!role) {
      return { success: false, error: 'Rol no encontrado' }
    }

    const permissions = this.roleRepo.getPermissions(user.roleId)

    const authenticated: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role,
      permissions,
    }

    return { success: true, user: authenticated }
  }

  /** Sin ningún usuario activo nadie podría entrar: la app ofrece crear el primer administrador. */
  needsSetup(): boolean {
    return this.userRepo.countActive() === 0
  }

  /** Crea el primer administrador e inicia su sesión. Solo funciona si no hay usuarios activos. */
  setupFirstAdmin(data: { username: string; password: string; name: string }): LoginResult {
    if (!this.needsSetup()) {
      return { success: false, error: 'Ya hay usuarios activos: iniciá sesión con uno de ellos' }
    }
    if (!data.username.trim() || !data.name.trim() || !data.password) {
      return { success: false, error: 'Completá usuario, nombre y contraseña' }
    }
    const adminRole = this.roleRepo.findByName(ADMIN_ROLE)
    if (!adminRole) return { success: false, error: 'No existe el rol admin' }
    this.createUser({ username: data.username.trim(), password: data.password, name: data.name.trim(), roleId: adminRole.id })
    return this.login({ username: data.username, password: data.password })
  }

  listPermissionAreas() {
    return PERMISSION_AREAS
  }

  listRolesWithPermissions() {
    return this.roleRepo.listWithPermissions()
  }

  createRole(data: { name: string; description: string; areas: string[] }): number {
    const name = this.validateRoleName(data.name)
    const id = this.roleRepo.create({ name, description: data.description.trim() })
    this.roleRepo.setAccess(id, this.validAreas(data.areas), ACCESS_ACTION)
    return id
  }

  updateRole(id: number, data: { name: string; description: string; areas: string[] }): void {
    const role = this.editableRole(id)
    const name = this.validateRoleName(data.name, role.id)
    this.roleRepo.update(id, { name, description: data.description.trim() })
    this.roleRepo.setAccess(id, this.validAreas(data.areas), ACCESS_ACTION)
  }

  deleteRole(id: number): void {
    this.editableRole(id)
    const users = this.roleRepo.countUsers(id)
    if (users > 0) {
      throw new Error(`No se puede eliminar: ${users === 1 ? 'hay 1 usuario' : `hay ${users} usuarios`} con este rol`)
    }
    this.roleRepo.delete(id)
  }

  /** El rol admin tiene acceso total fijo: no se edita ni se elimina. */
  private editableRole(id: number) {
    const role = this.roleRepo.findById(id)
    if (!role) throw new Error('Rol no encontrado')
    if (role.name === ADMIN_ROLE) throw new Error('El rol admin tiene acceso total y no se puede modificar')
    return role
  }

  private validateRoleName(raw: string, currentId?: number): string {
    const name = raw.trim()
    if (!name) throw new Error('Poné un nombre para el rol')
    if (name.toLowerCase() === ADMIN_ROLE) throw new Error('El nombre admin está reservado')
    const existing = this.roleRepo.findByName(name)
    if (existing && existing.id !== currentId) throw new Error(`Ya existe un rol llamado ${name}`)
    return name
  }

  private validAreas(areas: string[]): string[] {
    const known = new Set<string>(PERMISSION_AREAS.map(a => a.key))
    return [...new Set(areas)].filter(a => known.has(a))
  }

  listUsers() {
    return this.userRepo.list()
  }

  createUser(data: {
    username: string
    password: string
    name: string
    roleId: number
  }): number {
    const username = data.username.trim()
    if (!username) throw new Error('El usuario no puede estar vacío')
    if (this.userRepo.usernameExists(username)) {
      throw new Error(`Ya existe un usuario "${username}" (no se distinguen mayúsculas)`)
    }
    return this.userRepo.create({
      username,
      passwordHash: hashPassword(data.password),
      name: data.name,
      roleId: data.roleId,
    })
  }

  updateUser(
    id: number,
    data: Partial<{ name: string; roleId: number; active: boolean; password: string }>
  ): void {
    const current = this.userRepo.findById(id)
    if (!current) throw new Error('Usuario no encontrado')
    const adminRole = this.roleRepo.findByName(ADMIN_ROLE)
    const losesAdmin =
      current.active && current.roleId === adminRole?.id &&
      (data.active === false || (data.roleId !== undefined && data.roleId !== current.roleId))
    if (losesAdmin) this.assertAnotherActiveAdmin(id)

    const update: Parameters<UserRepository['update']>[1] = {}
    if (data.name !== undefined) update.name = data.name
    if (data.roleId !== undefined) update.roleId = data.roleId
    if (data.active !== undefined) update.active = data.active
    if (data.password !== undefined) update.passwordHash = hashPassword(data.password)
    this.userRepo.update(id, update)
  }

  deleteUser(id: number, currentUserId?: number): void {
    if (id === currentUserId) throw new Error('No podés eliminar tu propio usuario')
    // Se perdería quién hizo esas operaciones: el usuario se desactiva, no se borra.
    if (this.userRepo.countOperations(id) > 0) {
      throw new Error('Este usuario tiene operaciones registradas: desactivalo en vez de eliminarlo')
    }
    const current = this.userRepo.findById(id)
    if (current?.active && current.roleId === this.roleRepo.findByName(ADMIN_ROLE)?.id) {
      this.assertAnotherActiveAdmin(id)
    }
    this.userRepo.delete(id)
  }

  /** Impide dejar el sistema sin ningún administrador activo (nadie podría gestionar usuarios). */
  private assertAnotherActiveAdmin(userId: number): void {
    if (this.userRepo.countActiveWithRole(ADMIN_ROLE, userId) === 0) {
      throw new Error('Tiene que quedar al menos un administrador activo')
    }
  }

  listRoles() {
    return this.roleRepo.list()
  }
}
