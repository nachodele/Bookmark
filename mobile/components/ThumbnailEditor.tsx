import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { uploadBookmarkThumbnail } from '@/lib/api/storage';
import { faviconUrl } from '@/lib/utils/source';

type ThumbnailEditorProps = {
  userId: string;
  linkUrl: string;
  thumbnailUrl: string | null;
  onChange: (url: string | null) => void;
  colors: {
    text: string;
    textSecondary: string;
    textMuted: string;
    surfaceBorder: string;
    background: string;
    accent: string;
  };
};

export function ThumbnailEditor({
  userId,
  linkUrl,
  thumbnailUrl,
  onChange,
  colors,
}: ThumbnailEditorProps) {
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploading, setUploading] = useState(false);

  const displayUrl = thumbnailUrl ?? faviconUrl(linkUrl);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos', 'Allow photo access to pick a thumbnail.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const publicUrl = await uploadBookmarkThumbnail(userId, result.assets[0].uri);
      onChange(publicUrl);
      setShowUrlInput(false);
      setUrlInput('');
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload image');
    } finally {
      setUploading(false);
    }
  };

  const applyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      Alert.alert('Invalid URL', 'Thumbnail must start with http:// or https://');
      return;
    }
    onChange(trimmed);
    setShowUrlInput(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>Thumbnail</Text>
      <View style={[styles.previewWrap, { borderColor: colors.surfaceBorder, backgroundColor: colors.background }]}>
        {displayUrl ? (
          <Image source={{ uri: displayUrl }} style={styles.preview} />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={32} color={colors.textMuted} />
          </View>
        )}
        {uploading ? (
          <View style={styles.uploadOverlay}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={pickImage}
          disabled={uploading}
          style={({ pressed }) => [styles.actionChip, chipStyle(colors, pressed)]}
        >
          <Ionicons name="images-outline" size={16} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 13 }}>Choose photo</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowUrlInput((v) => !v)}
          disabled={uploading}
          style={({ pressed }) => [styles.actionChip, chipStyle(colors, pressed)]}
        >
          <Ionicons name="link-outline" size={16} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 13 }}>Paste URL</Text>
        </Pressable>
        {thumbnailUrl ? (
          <Pressable
            onPress={() => {
              onChange(null);
              setUrlInput('');
              setShowUrlInput(false);
            }}
            disabled={uploading}
            style={({ pressed }) => [styles.actionChip, chipStyle(colors, pressed)]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Remove</Text>
          </Pressable>
        ) : null}
      </View>

      {showUrlInput ? (
        <View style={styles.urlRow}>
          <TextInput
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="https://…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.urlInput, { color: colors.text, borderColor: colors.surfaceBorder, backgroundColor: colors.background }]}
          />
          <Pressable
            onPress={applyUrl}
            style={[styles.applyBtn, { backgroundColor: colors.accent }]}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Apply</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function chipStyle(
  colors: ThumbnailEditorProps['colors'],
  pressed: boolean,
) {
  return {
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.background,
    opacity: pressed ? 0.75 : 1,
  };
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  previewWrap: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    height: 140,
    position: 'relative',
  },
  preview: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 140 },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  urlRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  urlInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  applyBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
});
