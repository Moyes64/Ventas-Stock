import fs from 'fs'

/**
 * Vigila cuánto tarda cada viaje a Turso (sincronizar la réplica, escribir,
 * BEGIN/COMMIT). Esas llamadas son sincrónicas: mientras esperan, el proceso
 * principal no hace nada más y la ventana queda congelada. Si internet se corta
 * a mitad, la espera no tiene límite y la app "se cuelga" sin dejar rastro.
 *
 * - Al terminar, si tardó más de SLOW_MS se anota en el registro cuánto tardó.
 * - Mientras sigue esperando, un hilo aparte (que no se congela con el
 *   principal) escribe directo en logs/main.log a los 5 s, 15 s, 30 s, 60 s y
 *   después cada minuto. Así, aunque haya que forzar el cierre, queda anotado
 *   que la app estaba esperando a Turso y en qué operación.
 *
 * Solo se activa si crash-log dejó la ruta del registro en VS_LOG_FILE.
 */

const SLOW_MS = 3000

// [0] = inicio de la operación en curso (ms, 0 = ninguna)
let startArr: Float64Array | null = null
// [0] = número de operación, [1] = 1 si el hilo ya avisó que esta operación está trabada
let stateArr: Int32Array | null = null
let labelBuf: Uint8Array | null = null
let seq = 0
let started = false

const WORKER_CODE = `
const { workerData } = require('worker_threads')
const fs = require('fs')
const start = new Float64Array(workerData.startSab)
const state = new Int32Array(workerData.stateSab)
const label = new Uint8Array(workerData.labelSab)
const marks = [5, 15, 30, 60]
let lastSeq = -1
let next = 0
const readLabel = () => {
  let end = label.indexOf(0); if (end < 0) end = label.length
  return Buffer.from(label.slice(0, end)).toString('utf8')
}
setInterval(() => {
  const t0 = start[0]
  if (!t0) return
  const s = Atomics.load(state, 0)
  if (s !== lastSeq) { lastSeq = s; next = 0 }
  const secs = (Date.now() - t0) / 1000
  const due = next < marks.length ? marks[next] : marks[marks.length - 1] + 60 * (next - marks.length + 1)
  if (secs < due) return
  next++
  Atomics.store(state, 1, 1)
  try {
    fs.appendFileSync(workerData.file,
      new Date().toISOString() + ' WARN [turso] La app lleva ' + Math.round(secs) +
      ' s esperando a Turso (' + readLabel() + ') — la ventana está congelada mientras tanto\\n')
  } catch {}
}, 1000)
`

function ensureStarted(): void {
  if (started) return
  started = true
  const file = process.env.VS_LOG_FILE
  if (!file) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Worker } = require('worker_threads') as typeof import('worker_threads')
    const startSab = new SharedArrayBuffer(8)
    const stateSab = new SharedArrayBuffer(8)
    const labelSab = new SharedArrayBuffer(200)
    startArr = new Float64Array(startSab)
    stateArr = new Int32Array(stateSab)
    labelBuf = new Uint8Array(labelSab)
    const worker = new Worker(WORKER_CODE, { eval: true, workerData: { file, startSab, stateSab, labelSab } })
    worker.unref()
    worker.on('error', err => {
      try { fs.appendFileSync(file, `${new Date().toISOString()} WARN [turso] vigilante detenido: ${String(err)}\n`) } catch { /* nada */ }
    })
  } catch {
    startArr = null
    stateArr = null
    labelBuf = null
  }
}

/** Ejecuta fn midiendo la espera a Turso. label: qué se estaba haciendo. */
export function watchTurso<T>(label: string, fn: () => T): T {
  ensureStarted()
  // Operación dentro de otra (p. ej. la sincronización tras una escritura): la
  // vigila la de afuera.
  if (startArr && startArr[0]) return fn()
  const t0 = Date.now()
  if (startArr && stateArr && labelBuf) {
    const bytes = Buffer.from(label.slice(0, 190), 'utf8')
    labelBuf.fill(0)
    labelBuf.set(bytes.subarray(0, labelBuf.length - 1))
    Atomics.store(stateArr, 0, ++seq)
    Atomics.store(stateArr, 1, 0)
    startArr[0] = t0
  }
  try {
    return fn()
  } finally {
    const ms = Date.now() - t0
    const warned = stateArr ? Atomics.load(stateArr, 1) === 1 : false
    if (startArr) startArr[0] = 0
    if (ms >= SLOW_MS || warned) {
      console.warn(`[turso] ${label} tardó ${(ms / 1000).toFixed(1)} s${warned ? ' (se destrabó)' : ''}`)
    }
  }
}
