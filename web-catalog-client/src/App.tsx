import { useState } from 'react'
import { hasToken } from './lib/api'
import CategoriesView from './components/CategoriesView'
import ProductListView from './components/ProductListView'
import ProductEditorView from './components/ProductEditorView'

type View = { name: 'products' } | { name: 'categories' } | { name: 'editor'; productId: number }

export default function App() {
  // hasToken() lee (y consume) el ?token=... de la URL de pairing la primera
  // vez — llamarlo antes de cualquier otra cosa asegura que quede guardado
  // en localStorage incluso si esta pantalla nunca hace una request.
  const [tokenOk] = useState(hasToken())
  const [view, setView] = useState<View>({ name: 'products' })

  if (!tokenOk) {
    return (
      <div className="app">
        <div className="panel">
          <h1 className="app-title">Catálogo Web</h1>
          <p className="error">
            No se encontró un token de acceso. Pedí el enlace o el código QR de acceso remoto desde
            Ventas-Stock (Catálogo Web → Acceso remoto) y abrilo de nuevo desde acá.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">🌐 Catálogo Web</h1>
        <nav className="nav">
          <button className="btn" onClick={() => setView({ name: 'products' })}>Productos</button>
          <button className="btn" onClick={() => setView({ name: 'categories' })}>Categorías</button>
        </nav>
      </header>

      {view.name === 'products' && (
        <ProductListView onEditProduct={productId => setView({ name: 'editor', productId })} />
      )}
      {view.name === 'categories' && <CategoriesView />}
      {view.name === 'editor' && (
        <ProductEditorView productId={view.productId} onBack={() => setView({ name: 'products' })} />
      )}
    </div>
  )
}
