interface ConfirmDialogProps {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal de confirmación propio, en React. A propósito NO usa `window.confirm`:
 * en Electron (Windows), después de que se cierra un diálogo nativo bloqueante
 * el foco de teclado del BrowserWindow a veces no vuelve a sincronizarse con el
 * DOM — los inputs quedan clickeables pero no reciben eventos de teclado hasta
 * minimizar/restaurar la ventana. Ver StockCountPage para el caso que motivó esto.
 */
export function ConfirmDialog({
  title = 'Confirmar',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
        </div>
        <div className="form">
          <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{message}</p>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel} autoFocus>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
