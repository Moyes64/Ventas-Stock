/**
 * Generador ESC/POS para etiquetas térmicas autoadhesivas.
 *
 * Lógica de avance de papel:
 *   Después de imprimir el contenido, el cabezal quedó en algún punto
 *   dentro de la etiqueta. Para que la SIGUIENTE etiqueta quede posicionada
 *   automáticamente hay que avanzar:
 *
 *     feed_final = (labelHeightDots - dotsYaImprimidos) + gapDots
 *
 *   De esta forma el borde superior de la próxima etiqueta queda exactamente
 *   frente al cabezal, sin intervención manual.
 */

import {
  cmdReset,
  cmdAlign,
  cmdBold,
  lf,
  txt,
} from '../printer-config/service'
import type { LabelConfig, LabelLine } from '../label-config/types'

// ── ESC/POS helpers locales ───────────────────────────────────────────────────

function fontA(): Buffer { return Buffer.from([0x1b, 0x4d, 0x00]) }
function fontB(): Buffer { return Buffer.from([0x1b, 0x4d, 0x01]) }

/** GS ! n — 0x00=normal, 0x01=doble alto, 0x11=doble alto+ancho */
function charSize(n: number): Buffer { return Buffer.from([0x1d, 0x21, n]) }

/** ESC 3 n — interlineado en dots (1 dot ≈ 0.125 mm en 203 dpi) */
function lineSpacing(dots: number): Buffer {
  return Buffer.from([0x1b, 0x33, Math.max(1, Math.min(255, dots))])
}

/** ESC J n — avance de papel n dots sin imprimir (hasta 255 por llamada) */
function feedDots(dots: number): Buffer {
  return Buffer.from([0x1b, 0x4a, Math.max(0, Math.min(255, dots))])
}

/** Avanzar exactamente `totalDots` encadenando múltiples ESC J si hace falta */
function feedExact(totalDots: number): Buffer {
  const parts: Buffer[] = []
  let rem = Math.max(0, Math.round(totalDots))
  while (rem > 0) {
    const chunk = Math.min(rem, 255)
    parts.push(feedDots(chunk))
    rem -= chunk
  }
  return Buffer.concat(parts)
}

// ── Cálculo de caracteres disponibles ────────────────────────────────────────

function maxChars(fontSize: LabelLine['fontSize'], widthMm: number, leftMarginChars: number): number {
  const dots = widthMm * 8
  const dpc  = fontSize === 'small' ? 9 : fontSize === 'large' ? 24 : 12
  return Math.max(0, Math.floor(dots / dpc) - leftMarginChars)
}

// ── Builder principal ─────────────────────────────────────────────────────────

/**
 * Genera el buffer ESC/POS para UNA etiqueta.
 *
 * Usa un interlineado fijo de DOTS_PER_LINE dots por LF (2 mm).
 * Todo el avance de papel (contenido + espacio restante + gap) se realiza
 * con LF, que funciona en cualquier impresora térmica.
 *
 * Fórmula:
 *   totalLines = ceil((labelHeightMm + gapMm) × 8 / DOTS_PER_LINE)
 *   contentUnits = Σ lineUnits (normal/small=1, large=2)
 *   feedLines al final = totalLines − contentUnits (mínimo 0)
 */
export function buildLabelBuffer(config: LabelConfig): Buffer {
  const activeLines = config.lines.filter(l => l.text !== '')
  if (activeLines.length === 0) return Buffer.alloc(0)

  const parts: Buffer[] = []
  const p = (...bufs: Buffer[]) => parts.push(...bufs)

  // 16 dots = 2 mm por LF — resolución de 2 mm, suficiente para etiquetas
  const DOTS_PER_LINE = 16

  // Total de líneas que representan la etiqueta completa + gap
  const totalDots  = (config.labelHeightMm + config.gapMm) * 8
  const totalLines = Math.round(totalDots / DOTS_PER_LINE)

  p(cmdReset())
  p(lineSpacing(DOTS_PER_LINE))

  const margin = ' '.repeat(config.leftMarginChars)
  let usedLineUnits = 0

  for (const line of activeLines) {
    // Línea en blanco: solo avanza papel sin imprimir nada
    if (line.text.trim() === '') {
      p(lf(1))
      usedLineUnits += 1
      continue
    }

    const max     = maxChars(line.fontSize, config.labelWidthMm, config.leftMarginChars)
    const content = margin + line.text.slice(0, max)

    switch (line.fontSize) {
      case 'small':
        p(fontB(), charSize(0x00))
        break
      case 'large':
        p(fontA(), charSize(0x01))   // doble alto → ocupa 2 unidades
        break
      default:
        p(fontA(), charSize(0x00))
    }

    p(cmdAlign(line.alignment), cmdBold(line.bold))
    p(txt(content), lf(1))
    usedLineUnits += 1

    // Fuente large (doble alto) consume 2 unidades de alto
    if (line.fontSize === 'large') {
      p(lf(1))
      usedLineUnits += 1
    }
  }

  // Restaurar estado
  p(cmdBold(false), charSize(0x00), fontA(), cmdAlign('left'))

  // ── Avance final + trigger de vaciado ────────────────────────────────────
  //
  // La POS80 retiene los LF en su buffer hasta recibir un carácter imprimible.
  // El carácter imprimible fuerza al hardware a avanzar físicamente hasta la
  // posición acumulada y LUEGO imprimir. Por eso el espacio debe ir DESPUÉS
  // de los LF de feed, no antes.
  //
  // Orden correcto: [feed LFs] → [espacio+LF]
  //   Al recibir el espacio, la impresora ejecuta todos los LF pendientes
  //   (incluyendo el feed) para poder posicionarse antes de imprimir.
  //
  // -1 porque el espacio+LF al final suma 1 unidad adicional.
  const feedLines = Math.max(0, totalLines - usedLineUnits - 1)
  if (feedLines > 0) p(lf(feedLines))

  p(Buffer.from([0x20, 0x0a]))  // espacio + LF — dispara ejecución de todos los LF previos

  return Buffer.concat(parts)
}

/**
 * Avanza el papel N mm usando LF con el mismo interlineado base.
 * Usado para alinear manualmente la primera etiqueta.
 */
export function buildFeedBuffer(mm: number): Buffer {
  const DOTS_PER_LINE = 16
  const lines = Math.max(1, Math.round((mm * 8) / DOTS_PER_LINE))
  const parts: Buffer[] = [
    lineSpacing(DOTS_PER_LINE),
    lf(lines),
  ]
  return Buffer.concat(parts)
}
