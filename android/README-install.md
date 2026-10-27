# Android debug install (preserve ride history)

Ride history lives in the app’s private WebView storage. It survives **in-place updates** only. Uninstalling the app wipes it.

## Requirements for an update (not a new install)

1. **Same package:** `com.imagenecycle.app` (do not change `applicationId` / Capacitor `appId`)
2. **Same signing cert:** debug APKs are signed with the project keystore at `android/keystore/imagenecycle-debug.jks`
3. **Higher or equal `versionCode`:** see `android/version.properties` (bumped by `npm run android:bump`)

## Build + install (replace existing app)

```bash
npm run android:bump
npm run android:build:debug
npm run android:install:debug
```

`adb install -r` replaces the installed app **without** uninstalling. Prefer this over deleting the app from the phone.

APK path:

`android/app/build/outputs/apk/debug/app-debug.apk`

## One-time cutover

If the device already has an ImageneCycle build signed with Android Studio’s **default** `~/.android/debug.keystore`, installing this project-signed APK will fail with a signature mismatch.

1. Export rides (FIT/GPX) if you need them
2. Uninstall the old app **once**
3. Install the new project-signed `app-debug.apk`
4. Later updates with `adb install -r` keep history

## Sideloading from Files

When the signature matches, the system should offer **Update**. If you see “App not installed”, it is almost always a signature mismatch — export rides before uninstalling.

## Do not

- Change `applicationId` / `com.imagenecycle.app`
- Use `adb uninstall com.imagenecycle.app` for routine updates
- Commit or use a Play Store release key for these debug scripts
