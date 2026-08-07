import { useEffect, useState } from 'react'
import { api } from '../lib/api'

/**
 * El token no puede ir en la URL de un <img src>, así que las imágenes se
 * piden autenticadas por fetch y se muestran como blob: URL (ver
 * api.getImageObjectUrl). Cada instancia libera su object URL al desmontar
 * o cuando cambia de archivo, para no acumular memoria.
 */
export default function ProductImage({ filename, alt }: { filename: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    api.getImageObjectUrl(filename)
      .then(u => {
        if (cancelled) { URL.revokeObjectURL(u); return }
        objectUrl = u
        setUrl(u)
      })
      .catch(() => { /* placeholder queda visible */ })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [filename])

  if (!url) return <div className="img-placeholder" />
  return <img src={url} alt={alt} />
}
