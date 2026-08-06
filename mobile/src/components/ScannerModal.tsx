import { useEffect, useRef } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera'

const QR_TYPES: BarcodeType[] = ['qr']
// Formatos de código de barras habituales en productos de retail.
const PRODUCT_BARCODE_TYPES: BarcodeType[] = [
  'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'codabar', 'itf14',
]

interface ScannerModalProps {
  visible: boolean
  mode: 'qr' | 'barcode'
  onScanned: (data: string) => void
  onClose: () => void
}

/** Cámara compartida para escanear tanto el QR de pairing como códigos de barras de producto. */
export function ScannerModal({ visible, mode, onScanned, onClose }: ScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions()
  // Ref (no state): solo gatea llamados repetidos de onBarcodeScanned mientras
  // la cámara sigue enfocando el mismo código; no necesita disparar un render.
  const lockedRef = useRef(false)

  // Reabrir el modal siempre debe permitir un escaneo nuevo.
  useEffect(() => {
    if (visible) lockedRef.current = false
  }, [visible])

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission()
    }
  }, [visible, permission, requestPermission])

  if (!visible) return null

  const barcodeTypes = mode === 'qr' ? QR_TYPES : PRODUCT_BARCODE_TYPES

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes }}
            onBarcodeScanned={({ data }) => {
              if (lockedRef.current) return
              lockedRef.current = true
              onScanned(data)
            }}
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.permissionText}>
              {permission === null
                ? 'Cargando permisos de cámara...'
                : 'Se necesita permiso de cámara para escanear. Habilitalo en la configuración del celular.'}
            </Text>
          </View>
        )}

        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕ Cerrar</Text>
        </Pressable>

        <View style={styles.hint}>
          <Text style={styles.hintText}>
            {mode === 'qr' ? 'Apuntá al QR que aparece en la PC' : 'Apuntá al código de barras del producto'}
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permissionText: { color: '#fff', textAlign: 'center', fontSize: 16 },
  closeButton: {
    position: 'absolute', top: 48, right: 24,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
  },
  closeButtonText: { color: '#fff', fontWeight: '600' },
  hint: { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  hintText: { color: '#fff' },
})
