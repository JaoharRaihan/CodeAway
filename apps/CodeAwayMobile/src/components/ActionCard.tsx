import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import type { ActionCardData } from '@codeaway/shared'

interface Props {
  card: ActionCardData
}

export function ActionCard({ card }: Props) {
  const [expanded, setExpanded] = useState(false)

  const hasDetails = Boolean(
    (card.files && card.files.length > 0) ||
    card.diff ||
    card.output
  )

  const getKindMeta = () => {
    switch (card.kind) {
      case 'inspection':
        return { icon: '🔍', badgeColor: '#38bdf8', bg: '#0c2233', border: '#164e63' }
      case 'edit':
        return { icon: '✏️', badgeColor: '#4ade80', bg: '#0d2818', border: '#166534' }
      case 'test':
        return {
          icon: '🧪',
          badgeColor: card.status === 'failed' ? '#f87171' : '#a78bfa',
          bg: card.status === 'failed' ? '#331114' : '#20163b',
          border: card.status === 'failed' ? '#7f1d1d' : '#4c1d95',
        }
      case 'command':
      default:
        return {
          icon: '⚡',
          badgeColor: card.status === 'failed' ? '#f87171' : '#f59e0b',
          bg: card.status === 'failed' ? '#331114' : '#261b0c',
          border: card.status === 'failed' ? '#7f1d1d' : '#78350f',
        }
    }
  }

  const meta = getKindMeta()

  return (
    <View style={[styles.cardContainer, { backgroundColor: meta.bg, borderColor: meta.border }]}>
      <TouchableOpacity
        activeOpacity={hasDetails ? 0.7 : 1}
        onPress={() => hasDetails && setExpanded(!expanded)}
        style={styles.headerRow}
      >
        <Text style={styles.icon}>{meta.icon}</Text>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {card.title}
          </Text>
          <Text style={[styles.summary, { color: meta.badgeColor }]} numberOfLines={1}>
            {card.summary}
          </Text>
        </View>
        {hasDetails && (
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.expandedContent}>
          {/* File list for inspection */}
          {card.files && card.files.length > 0 && (
            <View style={styles.filesList}>
              {card.files.map((file, idx) => (
                <View key={idx} style={styles.fileItem}>
                  <Text style={styles.fileIcon}>📄</Text>
                  <Text style={styles.fileName}>{file}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Diff snippet for edits */}
          {card.diff && (
            <View style={styles.codeSnippetBox}>
              <Text style={styles.codeSnippetText} numberOfLines={12}>
                {card.diff}
              </Text>
            </View>
          )}

          {/* Terminal / Test command output */}
          {card.output && (
            <View style={styles.terminalBox}>
              <Text style={styles.terminalText} numberOfLines={14}>
                {card.output}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const styles = (StyleSheet as any).create({
  cardContainer: {
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 6,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  icon: {
    fontSize: 15,
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  summary: {
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    color: '#94a3b8',
    fontSize: 10,
    marginLeft: 4,
  },
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  filesList: {
    gap: 6,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fileIcon: {
    fontSize: 12,
  },
  fileName: {
    color: '#cbd5e1',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  codeSnippetBox: {
    backgroundColor: '#0a0a10',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  codeSnippetText: {
    color: '#86efac',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  terminalBox: {
    backgroundColor: '#0a0a0f',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e1b4b',
  },
  terminalText: {
    color: '#cbd5e1',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
})
