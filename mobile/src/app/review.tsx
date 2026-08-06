import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSession } from '../context/SessionContext'
import * as api from '../lib/api'
import type { SubmitCountItemInput } from '../types/contract'

/** Pantalla final: revisar lo contado y subirlo al servidor local de la PC. */
export default function ReviewScreen() {
  const router = useRouter()
  const { session, endSession } = useSession()
  // Sacamos una foto de la sesión al montar: subir con éxito llama a
  // endSession() y pone `session` en null, pero esta pantalla todavía
  // necesita esos datos para mostrar la confirmación de "conteo subido".
  const [snapshot] = useState(session)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Nunca navegar durante el render (React lo advierte y, peor, en este caso
  // se comería la pantalla de éxito) — la redirección va en un efecto.
  useEffect(() => {
    if (!snapshot) router.replace('/')
  }, [snapshot, router])

  if (!snapshot) return null

  const entries = Object.entries(snapshot.counts).map(([productId, entry]) => {
    const product = snapshot.products.find(p => p.id === Number(productId))
    return { productId: Number(productId), name: product?.name ?? `#${productId}`, ...entry }
  })

  async function handleUpload() {
    setUploading(true)
    setError(null)
    try {
      const items: SubmitCountItemInput[] = entries.map(e => ({
        productId: e.productId,
        countedQuantity: e.countedQuantity,
        note: e.note || undefined,
      }))
      await api.uploadItems(snapshot!.pairing, items)
      await endSession()
      setDone(true)
    } catch (err) {
      // Si falla (sin red, servidor apagado, etc.) el conteo queda intacto en el celular — se puede reintentar.
      setError(err instanceof Error ? err.message : 'Error al subir el conteo')
    } finally {
      setUploading(false)
    }
  }

  if (done) {
    return (
      <View style={styles.center}>
        <Text style={styles.doneTitle}>✅ Conteo subido</Text>
        <Text style={styles.doneSubtitle}>Ya podés conciliarlo desde la PC.</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/')}>
          <Text style={styles.primaryButtonText}>Nueva sesión</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{snapshot.label}</Text>
      <Text style={styles.subtitle}>{entries.length} productos contados</Text>

      <FlatList
        data={entries}
        keyExtractor={e => String(e.productId)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowName}>{item.name}</Text>
            <Text style={styles.rowQty}>{item.countedQuantity}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Todavía no contaste ningún producto.</Text>}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.footer}>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>← Seguir contando</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, styles.uploadButton]}
          onPress={() => { void handleUpload() }}
          disabled={uploading || entries.length === 0}
        >
          {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Subir conteo</Text>}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#666', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowName: { flex: 1 },
  rowQty: { fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, color: '#888' },
  error: { color: '#dc2626', textAlign: 'center', marginVertical: 8 },
  footer: { flexDirection: 'row', gap: 8, marginTop: 12 },
  secondaryButton: { flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center' },
  secondaryButtonText: { color: '#334155', fontWeight: '600' },
  primaryButton: { paddingVertical: 14, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center' },
  uploadButton: { flex: 2 },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  doneTitle: { fontSize: 22, fontWeight: '700' },
  doneSubtitle: { color: '#666' },
})
