export type LabelFontSize = 'small' | 'normal' | 'large'
export type LabelAlign = 'left' | 'center' | 'right'

export interface LabelLine {
  text: string
  fontSize: LabelFontSize
  alignment: LabelAlign
  bold: boolean
}

export interface LabelConfig {
  // Medidas del rollo
  labelWidthMm: number    // ancho de la etiqueta en mm (ej: 60)
  labelHeightMm: number   // alto de la etiqueta en mm (ej: 20)
  gapMm: number           // espacio entre etiquetas en mm
  leftMarginChars: number // columnas de sangría izquierda (0 = sin margen)

  // Contenido
  lines: LabelLine[]

  // Impresión
  defaultCopies: number
}

export const DEFAULT_LABEL_LINE: LabelLine = {
  text: '',
  fontSize: 'normal',
  alignment: 'center',
  bold: false,
}

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  labelWidthMm: 60,
  labelHeightMm: 20,
  gapMm: 3,
  leftMarginChars: 0,
  lines: [
    { ...DEFAULT_LABEL_LINE, fontSize: 'large', bold: true },
    { ...DEFAULT_LABEL_LINE, fontSize: 'normal' },
    { ...DEFAULT_LABEL_LINE, fontSize: 'small' },
  ],
  defaultCopies: 1,
}
