import crypto from 'crypto'
import type { Database } from 'better-sqlite3'
import { UserRepository, RoleRepository } from './repository'
import type { AuthenticatedUser, LoginRequest, LoginResult, Permission } from './types'

function hashPassword(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex')
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

    const hash = hashPassword(req.password)
    if (hash !== user.passwordHash) {
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
