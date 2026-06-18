import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Bookmark } from '@/lib/supabase/database.types';
import { useTheme } from '@/contexts/ThemeContext';
import { detectSourceApp, faviconUrl } from '@/lib/utils/source';

type BookmarkCardProps = {
  bookmark: Bookmark;
  boardName?: string | null;
  onLongPress?: () => void;
};

export function BookmarkCard({ bookmark, boardName, onLongPress }: BookmarkCardProps) {
  const { colors } = useTheme();
  const source = bookmark.source_app ?? detectSourceApp(bookmark.url);
  const thumb = bookmark.thumbnail_url ?? faviconUrl(bookmark.url);

  return (
    <Pressable
      onPress={() => Linking.openURL(bookmark.url)}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.surfaceBorder,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.thumbWrap, { backgroundColor: colors.placeholder }]}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} />
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 20 }}>🔗</Text>
        )}
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {bookmark.title || bookmark.url}
        </Text>
        {bookmark.description ? (
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
            {bookmark.description}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <View style={styles.metaRow}>
            <Text style={[styles.source, { color: colors.accent }]}>{source}</Text>
            {boardName ? (
              <Text style={[styles.boardBadge, { color: colors.textMuted }]}>{boardName}</Text>
            ) : null}
          </View>
          <Text style={[styles.url, { color: colors.textMuted }]} numberOfLines={1}>
            {bookmark.url}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    marginBottom: 10,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    marginTop: 4,
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  source: {
    fontSize: 12,
    fontWeight: '600',
  },
  boardBadge: {
    fontSize: 11,
  },
  url: {
    fontSize: 11,
  },
});
