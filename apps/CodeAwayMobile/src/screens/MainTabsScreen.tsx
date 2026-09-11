import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Platform,
} from 'react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import type { RootStackParamList, TabType } from '../navigation/types'
import { useTaskStore } from '../store/taskStore'

import HomeScreen from './HomeScreen'
import TasksScreen from './TasksScreen'
import ProjectsScreen from './ProjectsScreen'
import DevicesScreen from './DevicesScreen'
import SettingsScreen from './SettingsScreen'

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, any>
  route: RouteProp<RootStackParamList, 'Main'>
}

interface TabItem {
  id: TabType
  label: string
  icon: string
}

const TABS: TabItem[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'tasks', label: 'Tasks', icon: '📋' },
  { id: 'projects', label: 'Projects', icon: '📁' },
  { id: 'devices', label: 'Devices', icon: '💻' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export default function MainTabsScreen({ navigation, route }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>(route.params?.initialTab ?? 'home')
  const { tasks } = useTaskStore()

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab)
    }
  }, [route.params?.initialTab])

  const activeTasksCount = tasks.filter(
    (t) => t.status === 'running' || t.status === 'waiting_approval'
  ).length

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeScreen
            navigation={navigation}
            onSwitchTab={(tab: TabType) => setActiveTab(tab)}
            onNewTask={(params) => navigation.navigate('NewTask', params)}
          />
        )
      case 'tasks':
        return (
          <TasksScreen
            navigation={navigation}
            onNewTask={() => navigation.navigate('NewTask')}
          />
        )
      case 'projects':
        return (
          <ProjectsScreen
            navigation={navigation}
            onNewTask={(params) => navigation.navigate('NewTask', params)}
          />
        )
      case 'devices':
        return (
          <DevicesScreen
            navigation={navigation}
            onNewTask={(params) => navigation.navigate('NewTask', params)}
          />
        )
      case 'settings':
        return <SettingsScreen />
      default:
        return (
          <HomeScreen
            navigation={navigation}
            onSwitchTab={(tab: TabType) => setActiveTab(tab)}
            onNewTask={(params) => navigation.navigate('NewTask', params)}
          />
        )
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screenContainer}>
        {renderActiveScreen()}
      </View>

      {/* Modern Developer Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const hasTaskBadge = tab.id === 'tasks' && activeTasksCount > 0

          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrapper}>
                <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                  {tab.icon}
                </Text>
                {hasTaskBadge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{activeTasksCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : styles.tabLabelInactive]}>
                {tab.label}
              </Text>
              {isActive && <View style={styles.activeGlowIndicator} />}
            </TouchableOpacity>
          )
        })}
      </View>
    </SafeAreaView>
  )
}

const styles = (StyleSheet as any).create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#11111a',
    borderTopWidth: 1,
    borderTopColor: '#1e1e2d',
    paddingVertical: Platform.OS === 'ios' ? 8 : 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  tabButtonActive: {},
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    marginBottom: 3,
  },
  tabIcon: {
    fontSize: 18,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.08 }],
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#6c63ff',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: '#0a0a0f',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#a5b4fc',
    fontWeight: '700',
  },
  tabLabelInactive: {
    color: '#6b7280',
  },
  activeGlowIndicator: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 2,
    backgroundColor: '#6c63ff',
    borderRadius: 1,
  },
})
