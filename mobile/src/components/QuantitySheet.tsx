import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSession } from '../context/SessionContext'
import type { CountEntry } from '../lib/storage'
import type { StockCountProductForDownload } from '../types/contract'

interface QuantitySheetProps {
  /** null = cerrado. */
  product: StockCountProductForDownload | null
  initial?: CountEntry
  onClose: () => void
}

/**
 * Modal para tipear la cantidad contada (+ nota opcional) de un producto.
 * El padre debe montarlo con `key={product?.id}` — así cada producto abre
 * con una instancia nueva y estos useState arrancan de sus valores
 * iniciales correctos, sin necesitar un useEffect para resincronizarlos.
 */
export function QuantitySheet({ product, initial, onClose }: QuantitySheetProps) {
  const { setCount, clearCount } = useSession()
  const [quantity, setQuantity] = useState(initial ? String(initial.countedQuantity) : '')
  const [note, setNote] = useState(initial?.note ?? '')

  if (!product) return null
  // TS no propaga el narrowing de arriba a las closures declaradas debajo — capturamos una referencia ya angosta.
  const currentProduct = product

  async function handleSave() {
    const qty = parseFloat(quantity.replace(',', '.'))
    if (isNaN(qty) || qty < 0) return
    await setCount(currentProduct.id, { countedQuantity: qty, note })
    onClose()
  }

  async function handleClear() {
    await clearCount(currentProduct.id)
    onClose()
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.sku}>
            SKU: {product.sku}
            {product.barcode ? ` · ${product.barcode}` : ''}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Cantidad contada"
            keyboardType="decimal-pad"
            value={quantity}
            onChangeText={setQuantity}
            autoFocus
          />
          <TextInput style={styles.input} placeholder="Nota (opcional)" value={note} onChangeText={setNote} />

          <View style={styles.actions}>
            {initial && (
              <Pressable style={styles.clearButton} onPress={() => { void handleClear() }}>
                <Text style={styles.clearButtonText}>Quitar</Text>
              </Pressable>
            )}
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={() => { void handleSave() }}>
              <Text style={styles.saveButtonText}>Guardar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 10 },
  name: { fontSize: 18, fontWeight: '700' },
  sku: { color: '#666', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  clearButton: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center' },
  clearButtonText: { color: '#dc2626', fontWeight: '600' },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelButtonText: { color: '#334155', fontWeight: '600' },
  saveButton: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '600' },
})
