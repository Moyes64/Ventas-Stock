import { Stack } from 'expo-router'
import { SessionProvider } from '../context/SessionContext'

export default function RootLayout() {
  return (
    <SessionProvider>
      <Stack screenOptions={{ headerTitleAlign: 'center' }}>
        <Stack.Screen name="index" options={{ title: 'Conectar' }} />
        <Stack.Screen name="count" options={{ title: 'Contar stock', headerBackVisible: false }} />
        <Stack.Screen name="review" options={{ title: 'Revisar y subir' }} />
      </Stack>
    </SessionProvider>
  )
}
