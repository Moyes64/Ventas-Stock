import { useCallback, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'

interface ConfirmOptions {
  danger?: boolean
  title?: string
  confirmLabel?: string
  cancelLabel?: string
}

/**
 * Reemplazo de `window.confirm` basado en un modal propio en React.
 *
 * En Electron (Windows), después de que se cierra un diálogo nativo bloqueante
 * como `window.confirm`, el foco de teclado del BrowserWindow a veces no se
 * resincroniza con el DOM: los inputs quedan clickeables pero no reciben
 * eventos de teclado hasta minimizar/restaurar la ventana. Este hook evita el
 * diálogo nativo por completo.
 *
 * Uso: reemplazar `if (!window.confirm(msg)) return` por
 * `if (!(await confirm(msg))) return`, y renderizar `{dialog}` en el JSX de
 * la página (una sola vez, en cualquier lugar del árbol).
 */
export function useConfirm() {
  const [state, setState] = useState<{ message: string; options?: ConfirmOptions } | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve
      setState({ message, options })
    })
  }, [])

  function resolve(value: boolean) {
    setState(null)
    resolverRef.current?.(value)
    resolverRef.current = null
  }

  const dialog = state ? (
    <ConfirmDialog
      message={state.message}
      title={state.options?.title}
      danger={state.options?.danger}
      confirmLabel={state.options?.confirmLabel ?? (state.options?.danger ? 'Eliminar' : 'Confirmar')}
      cancelLabel={state.options?.cancelLabel}
      onConfirm={() => resolve(true)}
      onCancel={() => resolve(false)}
    />
  ) : null

  return { confirm, dialog }
}
