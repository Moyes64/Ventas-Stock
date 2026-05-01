export interface BackupInfo {
  filename: string
  path: string
  sizeBytes: number
  createdAt: string
}

export interface BackupResult {
  success: boolean
  backup?: BackupInfo
  error?: string
}

export interface RestoreResult {
  success: boolean
  error?: string
}
