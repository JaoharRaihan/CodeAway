import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import MainTabsScreen from '../screens/MainTabsScreen'
import NewTaskScreen from '../screens/NewTaskScreen'
import TaskDetailScreen from '../screens/TaskDetailScreen'
import type { RootStackParamList } from './types'

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Main"
        screenOptions={{
          headerStyle: { backgroundColor: '#16161e' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0a0a0f' },
        }}
      >
        <Stack.Screen name="Main" component={MainTabsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="NewTask" component={NewTaskScreen} options={{ title: '← New Task' }} />
        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task Progress' }} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
