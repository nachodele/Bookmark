# Android setup (macOS)

## 1. Install Android Studio

Download: [developer.android.com/studio](https://developer.android.com/studio)

During first launch, install the **Android SDK** when prompted.

Then open **Android Studio → Settings → Languages & Frameworks → Android SDK**:

- **SDK Platforms** → Android 15 (API 35) or latest
- **SDK Tools** → Android SDK Build-Tools, Platform-Tools, Emulator

## 2. Set environment variables

Add to `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator

# Java (bundled with Android Studio — required to build the app)
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH=$PATH:$JAVA_HOME/bin
```

Apply:

```bash
source ~/.zshrc
```

Verify:

```bash
adb version
```

## 3. Create an emulator

**Android Studio → Device Manager → Create device** → pick Pixel 6 → download a system image → Finish.

Start the emulator from Device Manager before running the app.

## 4. Run Bookmark

```bash
cd ~/Bookmark/mobile
npm install
npm run android
```

Do **not** paste shell comments (lines starting with `#`) into the terminal.

The `android/` folder already exists — you only need `npm run android:prebuild` if you delete `android/` or change native plugins.

## 5. Physical phone (optional)

1. Enable **Developer options** → **USB debugging**
2. Connect via USB
3. Run `adb devices` — phone should appear
4. `npm run android`

## Troubleshooting

| Error | Fix |
|-------|-----|
| `spawn adb ENOENT` | Android SDK not installed or `ANDROID_HOME` not set |
| `Invalid project root: .../#` | You pasted a `# comment` as part of the command |
| Emulator not found | Start emulator in Device Manager first |
| Build fails | Open `mobile/android` in Android Studio once to sync Gradle |
