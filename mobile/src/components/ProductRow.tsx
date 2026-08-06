import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { StockCountProductForDownload } from '../types/contract'
import type { CountEntry } from '../lib/storage'

interface ProductRowProps {
  product: StockCountProductForDownload
  counted?: CountEntry
  onPress: () => void
}

export function ProductRow({ product, counted, onPress }: ProductRowProps) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.info}>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.sku}>
          {product.sku}
          {product.barcode ? ` · ${product.barcode}` : ''}
        </Text>
      </View>
      {counted ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{counted.countedQuantity}</Text>
        </View>
      ) : (
        <Text style={styles.pending}>—</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '500' },
  sku: { fontSize: 12, color: '#888', marginTop: 2 },
  badge: { backgroundColor: '#dcfce7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#15803d', fontWeight: '700' },
  pending: { color: '#ccc', fontSize: 18 },
})
