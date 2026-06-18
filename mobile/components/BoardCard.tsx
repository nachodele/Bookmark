import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BoardWithCount } from '@/lib/supabase/database.types';
import { useTheme } from '@/contexts/ThemeContext';

type BoardCardProps = {
  board: BoardWithCount;
  onPress: () => void;
};

export function BoardCard({ board, onPress }: BoardCardProps) {
  const { colors, isDark } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.surfaceBorder,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[styles.cover, { backgroundColor: colors.placeholder }]}>
        {board.cover_url ? (
          <Image source={{ uri: board.cover_url }} style={styles.coverImage} />
        ) : (
          <View style={[styles.fallback, { backgroundColor: isDark ? '#1e293b' : '#dbeafe' }]}>
            <Text style={[styles.coverFallback, { color: colors.accent }]}>
              {board.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.overlay,
            { backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)' },
          ]}
        />
        <View style={styles.coverText}>
          <Text style={styles.nameOnCover} numberOfLines={2}>
            {board.name}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    margin: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  cover: {
    aspectRatio: 0.85,
    justifyContent: 'flex-end',
  },
  coverImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  fallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallback: {
    fontSize: 48,
    fontWeight: '700',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  coverText: {
    padding: 14,
    gap: 4,
  },
  nameOnCover: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
