#!/usr/bin/env node
'use strict'
/**
 * Verifica que el paquete armado por electron-builder incluya los módulos que
 * se cargan en tiempo de ejecución (better-sqlite3 y libsql con sus
 * dependencias). Uso: node scripts/verify-packaged-modules.cjs <ruta a app.asar>
 */
const fs = require('fs')
const path = require('path')

const asarPath = process.argv[2]
if (!asarPath || !fs.existsSync(asarPath)) {
  console.error(`[verify] No existe el app.asar: ${asarPath}`)
  process.exit(1)
}

function findAsarLib () {
  const store = path.resolve(__dirname, '..', 'node_modules', '.pnpm')
  for (const entry of fs.readdirSync(store)) {
    if (!entry.startsWith('@electron+asar@')) continue
    const p = path.join(store, entry, 'node_modules', '@electron', 'asar')
    if (fs.existsSync(p)) return require(p)
  }
  throw new Error('No encontré @electron/asar en node_modules/.pnpm')
}

const asar = findAsarLib()
const files = new Set(asar.listPackage(asarPath).map(f => f.split(path.sep).join('/')))
const unpacked = asarPath + '.unpacked'

const platformPkg = {
  darwin: `@libsql/darwin-${process.arch}`,
  win32: '@libsql/win32-x64-msvc',
  linux: '@libsql/linux-x64-gnu',
}[process.platform]

const required = ['better-sqlite3', 'bindings', 'file-uri-to-path', 'libsql', '@neon-rs/load', 'detect-libc', platformPkg]
const missing = required.filter(m => !files.has(`/node_modules/${m}/package.json`))
if (!fs.existsSync(path.join(unpacked, 'node_modules', platformPkg))) {
  missing.push(`${platformPkg} (binario .node sin desempaquetar)`)
}

if (missing.length) {
  console.error('[verify] Faltan módulos en el paquete:\n  - ' + missing.join('\n  - '))
  process.exit(1)
}
console.log('[verify] OK: ' + required.join(', '))
