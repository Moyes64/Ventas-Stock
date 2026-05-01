export interface Permission {
  id: number
  roleId: number
  module: string
  action: string
}

export interface Role {
  id: number
  name: string
  description: string
  createdAt: string
  permissions?: Permission[]
}

export interface User {
  id: number
  username: string
  name: string
  roleId: number
  role?: Role
  active: boolean
  createdAt: string
  updatedAt: string
}

/** Shape returned by login — never includes passwordHash. */
export interface AuthenticatedUser {
  id: number
  username: string
  name: string
  role: Role
  permissions: Permission[]
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResult {
  success: boolean
  user?: AuthenticatedUser
  error?: string
}
