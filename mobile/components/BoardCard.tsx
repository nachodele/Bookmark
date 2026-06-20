import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BoardWithCount } from '@/lib/supabase/database.types';
import { useTheme } from '@/contexts/ThemeContext';

type BoardCardProps = {
  board: BoardWithCount;
  onPress: () => void;
  height?: number;
};

export function BoardCard({ board, onPress, height }: BoardCardProps) {
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
      <View
        style={[
          styles.cover,
          { backgroundColor: colors.placeholder },
          height != null ? { height } : styles.coverDefault,
        ]}
      >
        {board.cover_url ? (
          <Image source={{ uri: board.cover_url }} style={styles.coverImage} />
        ) : (
          <View style={[styles.fallback, { backgroundColor: colors.accentMuted }]}>
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
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    margin: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cover: {
    justifyContent: 'flex-end',
  },
  coverDefault: {
    aspectRatio: 1.15,
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
    fontSize: 28,
    fontWeight: '700',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  coverText: {
    padding: 8,
    gap: 2,
  },
  nameOnCover: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
