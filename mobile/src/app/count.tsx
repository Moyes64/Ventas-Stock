import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsFocused, useRouter } from 'expo-router'
import { useSession } from '../context/SessionContext'
import { ScannerModal } from '../components/ScannerModal'
import { QuantitySheet } from '../components/QuantitySheet'
import { ProductRow } from '../components/ProductRow'
import type { StockCountProductForDownload } from '../types/contract'

// Referencia estable: si el fallback fuera un array literal `[]` inline, cambiaría
// de identidad en cada render y el useMemo de abajo se recalcularía siempre.
const EMPTY_PRODUCTS: StockCountProductForDownload[] = []

/** Pantalla principal: buscar/escanear productos y tipear la cantidad contada de cada uno. */
export default function CountScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { session, endSession } = useSession()
  const [query, setQuery] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [activeProduct, setActiveProduct] = useState<StockCountProductForDownload | null>(null)
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null)

  const products = session?.products ?? EMPTY_PRODUCTS
  const counts = session?.counts ?? {}

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
    )
  }, [products, query])

  const countedTotal = Object.keys(counts).length

  // La pantalla de Revisar sube el conteo y limpia la sesión (endSession) sin
  // desmontar esta — sigue viva más abajo en el stack. Sin `isFocused`, este
  // efecto dispararía igual y pisaría la navegación de esa pantalla. Nunca
  // navegar durante el render (React lo advierte) — la redirección va en un efecto.
  const isFocused = useIsFocused()
  useEffect(() => {
    if (isFocused && !session) router.replace('/')
  }, [isFocused, session, router])

  if (!session) {
    // Sin sesión activa (p. ej. se canceló desde otra pantalla): volver a parear.
    return null
  }

  function handleBarcodeScanned(data: string) {
    setScannerOpen(false)
    const match = products.find(p => p.barcode === data)
    if (match) {
      setNotFoundBarcode(null)
      setActiveProduct(match)
    } else {
      setNotFoundBarcode(data)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          placeholder="Buscar por nombre, SKU o código..."
          value={query}
          onChangeText={setQuery}
        />
        <Pressable style={styles.scanButton} onPress={() => setScannerOpen(true)}>
          <Text style={styles.scanButtonText}>📷</Text>
        </Pressable>
      </View>

      {notFoundBarcode && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            No encontré ningún producto con el código &quot;{notFoundBarcode}&quot;. Probá buscarlo por nombre.
          </Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={p => String(p.id)}
        renderItem={({ item }) => (
          <ProductRow product={item} counted={counts[item.id]} onPress={() => setActiveProduct(item)} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>Sin resultados.</Text>}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Text style={styles.progress}>
          {countedTotal} de {products.length} contados
        </Text>
        <View style={styles.footerButtons}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              void endSession().then(() => router.replace('/'))
            }}
          >
            <Text style={styles.secondaryButtonText}>Cancelar sesión</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/review')}>
            <Text style={styles.primaryButtonText}>Ir a revisar →</Text>
          </Pressable>
        </View>
      </View>

      <ScannerModal
        visible={scannerOpen}
        mode="barcode"
        onScanned={handleBarcodeScanned}
        onClose={() => setScannerOpen(false)}
      />

      <QuantitySheet
        key={activeProduct?.id ?? 'none'}
        product={activeProduct}
        initial={activeProduct ? counts[activeProduct.id] : undefined}
        onClose={() => setActiveProduct(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { flexDirection: 'row', gap: 8, padding: 12 },
  search: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  scanButton: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  scanButtonText: { fontSize: 20 },
  notice: { backgroundColor: '#fef9c3', padding: 10, marginHorizontal: 12, borderRadius: 8, marginBottom: 8 },
  noticeText: { color: '#92400e' },
  empty: { textAlign: 'center', marginTop: 40, color: '#888' },
  footer: { padding: 12, borderTopWidth: 1, borderTopColor: '#eee', gap: 8 },
  progress: { textAlign: 'center', color: '#555' },
  footerButtons: { flexDirection: 'row', gap: 8 },
  secondaryButton: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center' },
  secondaryButtonText: { color: '#334155', fontWeight: '600' },
  primaryButton: { flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
})
