# ANT+ sensors (Android)

ImageneCycle can pair **ANT+** heart rate, bike speed/cadence, and power sensors on **Android Capacitor builds** via Garmin’s ANT+ PluginLib.

## Device requirements

1. Install from Google Play (or OEM preinstall):
   - [ANT Radio Service](https://play.google.com/store/apps/details?id=com.dsi.ant.service.socket)
   - [ANT+ Plugins Service](https://play.google.com/store/apps/details?id=com.dsi.ant.plugins.antplus)
2. Hardware: a phone with a built-in ANT+ radio **or** a USB ANT stick (OTG).

Web / desktop Chromium still uses **BLE only**. Dual-mode sensors (BLE + ANT+) can pair over BLE without ANT services.

## SDK libraries (vendored)

Not published to Maven Central. Checked into:

- `android/app/libs/antpluginlib_3-9-0.aar`
- `android/app/libs/fit_21.105.00.jar`

Source: [ant-wireless/ANT-Android-SDKs](https://github.com/ant-wireless/ANT-Android-SDKs) → `ANT+_Android_SDK/API`.

## In-app pairing

Open **Sensor hardware manager** → for each role (HR / CSC / Power) use **Pair ANT+**. Connecting ANT+ for a role disconnects BLE for that role (and vice versa) so the HUD has one source.
