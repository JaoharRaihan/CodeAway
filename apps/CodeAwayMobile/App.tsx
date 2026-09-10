import React, { useEffect, useCallback } from 'react'
import { StatusBar, ActivityIndicator, View, StyleSheet } from 'react-native'
import { useAuthStore } from './src/store/authStore'
import { getStoredUser } from './src/services/auth'
import AppNavigator from './src/navigation/AppNavigator'
import LoginScreen from './src/screens/LoginScreen'

export default function App() {
  const { user, isLoading, setUser, setLoading } = useAuthStore()

  const restoreSession = useCallback(() => {
    getStoredUser().then((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [setUser, setLoading])

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  if (isLoading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    )
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      {user ? <AppNavigator /> : <LoginScreen />}
    </>
  )
}

const styles = (StyleSheet as any).create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0f' },
})
