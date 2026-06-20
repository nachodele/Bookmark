/** @type {import('expo/config').ExpoConfig} */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Bookmark] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Use a local .env file or EAS Environment Variables (npm run eas:env).',
  );
}

module.exports = {
  name: 'Bookmark',
  slug: 'bookmark',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'bookmark',
  userInterfaceStyle: 'automatic',
  owner: 'nachodele',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.bookmark.app',
    infoPlist: {
      CFBundleDisplayName: 'Bookmark',
    },
  },
  android: {
    package: 'com.bookmark.app',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#C8E6F5',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
    name: 'Bookmark',
    shortName: 'Bookmark',
    description: 'Save and organize links with AI — your universal Save button for the web.',
    themeColor: '#87CEEB',
    backgroundColor: '#C8E6F5',
    display: 'standalone',
    orientation: 'portrait',
    startUrl: '/',
    lang: 'en',
    splash: {
      backgroundColor: '#C8E6F5',
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
    },
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-web-browser',
    [
      'expo-build-properties',
      {
        android: { newArchEnabled: true },
        ios: { newArchEnabled: true },
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#C8E6F5',
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
      },
    ],
    [
      'expo-share-intent',
      {
        iosActivationRules: {
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsWebPageWithMaxCount: 1,
          NSExtensionActivationSupportsText: true,
        },
        iosShareExtensionName: 'Bookmark Share',
        androidIntentFilters: ['text/*'],
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Bookmark uses your photos to set board cover images.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: '15672659-4234-465b-8eeb-9bdf266955e6',
    },
  },
};
