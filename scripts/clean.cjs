#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

const targets = [
  path.join(root, 'dist'),
  path.join(root, 'node_modules', '.vite'),
]

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true })
  console.log(`Removed: ${path.relative(root, target)}`)
}

console.log('Clean complete.')
