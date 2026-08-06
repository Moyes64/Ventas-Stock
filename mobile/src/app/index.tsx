import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSession } from '../context/SessionContext'
import { ScannerModal } from '../components/ScannerModal'
import * as api from '../lib/api'
import type { StockCountPairingPayload } from '../types/contract'

/** Pantalla inicial: parear con la PC escaneando el QR (o a mano) para arrancar una sesión de conteo. */
export default function PairingScreen() {
  const router = useRouter()
  const { loading, session, startSession } = useSession()

  const [scannerOpen, setScannerOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [host, setHost] = useState('')
  const [port, setPort] = useState('4278')
  const [token, setToken] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Si ya hay una sesión en curso (la app se cerró a mitad de conteo), saltar directo a contar.
  useEffect(() => {
    if (!loading && session) {
      router.replace('/count')
    }
  }, [loading, session, router])

  async function connect(pairing: StockCountPairingPayload) {
    setConnecting(true)
    setError(null)
    try {
      const reachable = await api.healthCheck(pairing)
      if (!reachable) {
        throw new Error('No se pudo conectar. Verificá que el celular esté en la misma red Wi-Fi que la PC.')
      }
      const data = await api.downloadSession(pairing)
      await startSession(pairing, data.label, data.products)
      router.replace('/count')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conectar')
    } finally {
      setConnecting(false)
    }
  }

  function handleScanned(data: string) {
    setScannerOpen(false)
    try {
      const parsed = JSON.parse(data) as Partial<StockCountPairingPayload>
      if (parsed.v !== 1 || !parsed.host || !parsed.port || !parsed.token || !parsed.sessionId) {
        throw new Error('QR inválido')
      }
      void connect(parsed as StockCountPairingPayload)
    } catch {
      setError('El código escaneado no es un QR de pairing válido.')
    }
  }

  function handleManualConnect() {
    const portNum = parseInt(port, 10)
    const sessionIdNum = parseInt(sessionId, 10)
    if (!host.trim() || !portNum || !token.trim() || !sessionIdNum) {
      setError('Completá todos los campos.')
      return
    }
    void connect({ v: 1, host: host.trim(), port: portNum, token: token.trim(), sessionId: sessionIdNum })
  }

  if (loading || (session && !loading)) {
    // Redirigiendo a /count (o cargando el storage todavía) — evita parpadear esta pantalla.
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>📱 Conteo de stock</Text>
      <Text style={styles.subtitle}>
        Escaneá el código QR que aparece en Ventas-Stock (Stock → Conteo de stock) para empezar una sesión.
      </Text>

      <Pressable style={styles.primaryButton} onPress={() => setScannerOpen(true)} disabled={connecting}>
        <Text style={styles.primaryButtonText}>📷 Escanear QR</Text>
      </Pressable>

      <Pressable onPress={() => setManualOpen(o => !o)} style={styles.linkButton}>
        <Text style={styles.linkButtonText}>{manualOpen ? 'Ocultar carga manual' : 'Ingresar datos manualmente'}</Text>
      </Pressable>

      {manualOpen && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="IP (ej: 192.168.1.10)" value={host} onChangeText={setHost} autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="Puerto" value={port} onChangeText={setPort} keyboardType="number-pad" />
          <TextInput style={styles.input} placeholder="Token" value={token} onChangeText={setToken} autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="ID de sesión" value={sessionId} onChangeText={setSessionId} keyboardType="number-pad" />
          <Pressable style={styles.primaryButton} onPress={handleManualConnect} disabled={connecting}>
            <Text style={styles.primaryButtonText}>Conectar</Text>
          </Pressable>
        </View>
      )}

      {connecting && <ActivityIndicator style={styles.spinner} />}
      {error && <Text style={styles.error}>{error}</Text>}

      <ScannerModal visible={scannerOpen} mode="qr" onScanned={handleScanned} onClose={() => setScannerOpen(false)} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 12 },
  primaryButton: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkButton: { alignItems: 'center', paddingVertical: 8 },
  linkButtonText: { color: '#2563eb' },
  form: { gap: 8, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  spinner: { marginTop: 16 },
  error: { color: '#dc2626', textAlign: 'center', marginTop: 12 },
})
