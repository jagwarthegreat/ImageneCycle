package com.imagenecycle.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BackgroundLocation",
    permissions = {
        @Permission(
            strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
            alias = "backgroundLocation"
        )
    }
)
public class BackgroundLocationPlugin extends Plugin {

    @PluginMethod
    public void check(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasBackground());
        call.resolve(ret);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        if (hasBackground()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        // Android 11+: system UI for ACCESS_BACKGROUND_LOCATION lands on Location → Allow all the time
        requestPermissionForAlias("backgroundLocation", call, "backgroundPermCallback");
    }

    @PermissionCallback
    private void backgroundPermCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasBackground());
        // Do not bounce to generic App info on cancel — that buries "Allow all the time".
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        // Prefer re-triggering the background permission flow (Location page) over App info.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasBackground()) {
            requestPermissionForAlias("backgroundLocation", call, "openSettingsCallback");
            return;
        }
        openAppDetailsSettings();
        call.resolve();
    }

    @PermissionCallback
    private void openSettingsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = hasBackground();
        ret.put("granted", granted);
        if (!granted) {
            openAppDetailsSettings();
            ret.put("openedSettings", true);
        }
        call.resolve(ret);
    }

    private boolean hasBackground() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return true;
        }
        return ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.ACCESS_BACKGROUND_LOCATION
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private void openAppDetailsSettings() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
