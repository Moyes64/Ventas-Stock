import crypto from 'crypto'
import type { Database } from 'better-sqlite3'
import { UserRepository, RoleRepository } from './repository'
import type { AuthenticatedUser, LoginRequest, LoginResult, Permission } from './types'

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 64 } as const

/** Returns a `salt$hash` string using scrypt. */
function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(plain, salt, SCRYPT_PARAMS.dkLen, SCRYPT_PARAMS).toString('hex')
  return `${salt}$${hash}`
}

/**
 * Verifies a password against a stored hash.
 * Supports both scrypt (`salt$hash`) and legacy SHA-256 (plain hex, 64 chars).
 */
function verifyPassword(plain: string, stored: string): boolean {
  if (stored.includes('$')) {
    const [salt, expected] = stored.split('$')
    const actual = crypto.scryptSync(plain, salt, SCRYPT_PARAMS.dkLen, SCRYPT_PARAMS).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
  }
  // Legacy SHA-256 fallback (allows migration without forcing re-registration)
  const legacy = crypto.createHash('sha256').update(plain).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored))
}

export class AuthService {
  private readonly userRepo: UserRepository
  private readonly roleRepo: RoleRepository

  constructor(db: Database) {
    this.userRepo = new UserRepository(db)
    this.roleRepo = new RoleRepository(db)
  }

  login(req: LoginRequest): LoginResult {
    const user = this.userRepo.findByUsername(req.username)
    if (!user) {
      return { success: false, error: 'Usuario no encontrado' }
    }

    if (!verifyPassword(req.password, user.passwordHash)) {
      return { success: false, error: 'Contraseña incorrecta' }
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

  hasPermission(permissions: Permission[], module: string, action: string): boolean {
    return permissions.some(
      p => p.module === module && (p.action === action || p.action === 'admin')
    )
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
    return this.userRepo.create({
      username: data.username,
      passwordHash: hashPassword(data.password),
      name: data.name,
      roleId: data.roleId,
    })
  }

  updateUser(
    id: number,
    data: Partial<{ name: string; roleId: number; active: boolean; password: string }>
  ): void {
    const update: Parameters<UserRepository['update']>[1] = {}
    if (data.name !== undefined) update.name = data.name
    if (data.roleId !== undefined) update.roleId = data.roleId
    if (data.active !== undefined) update.active = data.active
    if (data.password !== undefined) update.passwordHash = hashPassword(data.password)
    this.userRepo.update(id, update)
  }

  deleteUser(id: number): void {
    this.userRepo.delete(id)
  }

  listRoles() {
    return this.roleRepo.list()
  }
}
