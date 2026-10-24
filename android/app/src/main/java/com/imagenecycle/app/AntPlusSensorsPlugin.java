package com.imagenecycle.app;

import android.app.Activity;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.dsi.ant.plugins.antplus.pcc.AntPlusBikeCadencePcc;
import com.dsi.ant.plugins.antplus.pcc.AntPlusBikePowerPcc;
import com.dsi.ant.plugins.antplus.pcc.AntPlusBikeSpeedDistancePcc;
import com.dsi.ant.plugins.antplus.pcc.AntPlusHeartRatePcc;
import com.dsi.ant.plugins.antplus.pcc.defines.DeviceState;
import com.dsi.ant.plugins.antplus.pcc.defines.EventFlag;
import com.dsi.ant.plugins.antplus.pcc.defines.RequestAccessResult;
import com.dsi.ant.plugins.antplus.pccbase.AntPluginPcc;
import com.dsi.ant.plugins.antplus.pccbase.PccReleaseHandle;

import java.math.BigDecimal;
import java.util.EnumSet;

/**
 * Capacitor bridge to Garmin ANT+ PluginLib for HR / bike speed-cadence / power.
 * Requires ANT Radio Service + ANT+ Plugins Service on the device.
 */
@CapacitorPlugin(name = "AntPlusSensors")
public class AntPlusSensorsPlugin extends Plugin {

    private static final BigDecimal WHEEL_CIRCUMFERENCE_M = new BigDecimal("2.105");

    private PccReleaseHandle<AntPlusHeartRatePcc> hrmHandle;
    private PccReleaseHandle<AntPlusBikeSpeedDistancePcc> speedHandle;
    private PccReleaseHandle<AntPlusBikeCadencePcc> cadenceHandle;
    private PccReleaseHandle<AntPlusBikePowerPcc> powerHandle;

    private AntPlusHeartRatePcc hrmPcc;
    private AntPlusBikeSpeedDistancePcc speedPcc;
    private AntPlusBikeCadencePcc cadencePcc;
    private AntPlusBikePowerPcc powerPcc;

    private PluginCall pendingHrmCall;
    private PluginCall pendingCscCall;
    private PluginCall pendingPowerCall;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PackageManager pm = getContext().getPackageManager();
            boolean radio = isPackageInstalled(pm, "com.dsi.ant.service.socket");
            boolean plugins = isPackageInstalled(pm, "com.dsi.ant.plugins.antplus");
            ret.put("available", radio && plugins);
            ret.put("antRadioService", radio);
            ret.put("antPluginsService", plugins);
            if (!radio || !plugins) {
                ret.put(
                    "error",
                    "Install ANT Radio Service and ANT+ Plugins Service from Google Play, then retry."
                );
            }
        } catch (Exception e) {
            ret.put("available", false);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "ANT+ check failed");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void searchAndConnect(PluginCall call) {
        String profile = call.getString("profile", "");
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No Android activity");
            return;
        }

        JSObject avail = checkServicesObject();
        if (!avail.getBool("available")) {
            call.reject(avail.getString("error", "ANT+ services unavailable"));
            return;
        }

        call.setKeepAlive(true);

        switch (profile) {
            case "hrm":
                releaseHrm();
                pendingHrmCall = call;
                emitLog("SYSTEM", "Scanning for ANT+ heart rate…");
                hrmHandle = AntPlusHeartRatePcc.requestAccess(
                    activity,
                    activity,
                    hrmAccessReceiver,
                    hrmStateReceiver
                );
                break;
            case "csc":
                releaseCsc();
                pendingCscCall = call;
                emitLog("SYSTEM", "Scanning for ANT+ bike speed / cadence…");
                speedHandle = AntPlusBikeSpeedDistancePcc.requestAccess(
                    activity,
                    activity,
                    speedAccessReceiver,
                    speedStateReceiver
                );
                break;
            case "power":
                releasePower();
                pendingPowerCall = call;
                emitLog("SYSTEM", "Scanning for ANT+ bike power…");
                powerHandle = AntPlusBikePowerPcc.requestAccess(
                    activity,
                    activity,
                    powerAccessReceiver,
                    powerStateReceiver
                );
                break;
            default:
                call.setKeepAlive(false);
                call.reject("Unknown profile: " + profile + " (use hrm|csc|power)");
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String profile = call.getString("profile", "");
        switch (profile) {
            case "hrm":
                releaseHrm();
                emitConnection("hrm", false, null);
                break;
            case "csc":
                releaseCsc();
                emitConnection("csc", false, null);
                break;
            case "power":
                releasePower();
                emitConnection("power", false, null);
                break;
            default:
                call.reject("Unknown profile: " + profile);
                return;
        }
        call.resolve();
    }

    @PluginMethod
    public void disconnectAll(PluginCall call) {
        releaseHrm();
        releaseCsc();
        releasePower();
        emitConnection("hrm", false, null);
        emitConnection("csc", false, null);
        emitConnection("power", false, null);
        emitLog("SYSTEM", "All ANT+ sensors disconnected.");
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        releaseHrm();
        releaseCsc();
        releasePower();
        super.handleOnDestroy();
    }

    private boolean isPackageInstalled(PackageManager pm, String pkg) {
        try {
            pm.getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private JSObject checkServicesObject() {
        JSObject ret = new JSObject();
        PackageManager pm = getContext().getPackageManager();
        boolean radio = isPackageInstalled(pm, "com.dsi.ant.service.socket");
        boolean plugins = isPackageInstalled(pm, "com.dsi.ant.plugins.antplus");
        ret.put("available", radio && plugins);
        ret.put(
            "error",
            radio && plugins
                ? null
                : "Install ANT Radio Service and ANT+ Plugins Service from Google Play, then retry."
        );
        return ret;
    }

    private void emitLog(String source, String data) {
        JSObject o = new JSObject();
        o.put("source", source);
        o.put("data", data);
        notifyListeners("log", o);
    }

    private void emitConnection(String profile, boolean connected, String deviceName) {
        JSObject o = new JSObject();
        o.put("profile", profile);
        o.put("connected", connected);
        if (deviceName != null) o.put("deviceName", deviceName);
        notifyListeners("connection", o);
    }

    private void resolvePending(PluginCall call, boolean success, String deviceName, String error) {
        if (call == null) return;
        JSObject ret = new JSObject();
        ret.put("success", success);
        if (deviceName != null) ret.put("deviceName", deviceName);
        if (error != null) ret.put("error", error);
        call.resolve(ret);
    }

    private String deviceLabel(AntPluginPcc pcc, String fallback) {
        if (pcc == null) return fallback;
        try {
            String name = pcc.getDeviceName();
            if (name != null && !name.trim().isEmpty()) return name;
        } catch (Exception ignored) {
        }
        try {
            return fallback + " #" + pcc.getAntDeviceNumber();
        } catch (Exception ignored) {
            return fallback;
        }
    }

    // —— Heart rate ——

    private final AntPluginPcc.IPluginAccessResultReceiver<AntPlusHeartRatePcc> hrmAccessReceiver =
        new AntPluginPcc.IPluginAccessResultReceiver<AntPlusHeartRatePcc>() {
            @Override
            public void onResultReceived(
                AntPlusHeartRatePcc result,
                RequestAccessResult resultCode,
                DeviceState initialDeviceState
            ) {
                PluginCall call = pendingHrmCall;
                pendingHrmCall = null;
                if (resultCode == RequestAccessResult.SUCCESS && result != null) {
                    hrmPcc = result;
                    String name = deviceLabel(result, "ANT+ HRM");
                    subscribeHrm(result);
                    emitConnection("hrm", true, name);
                    emitLog("HRM", "Connected: " + name);
                    resolvePending(call, true, name, null);
                } else {
                    String err = accessError("HRM", resultCode);
                    emitLog("SYSTEM", err);
                    resolvePending(call, false, null, err);
                }
            }
        };

    private final AntPluginPcc.IDeviceStateChangeReceiver hrmStateReceiver =
        new AntPluginPcc.IDeviceStateChangeReceiver() {
            @Override
            public void onDeviceStateChange(final DeviceState newDeviceState) {
                if (newDeviceState == DeviceState.DEAD || newDeviceState == DeviceState.CLOSED) {
                    emitLog("HRM", "Disconnected (" + newDeviceState + ")");
                    hrmPcc = null;
                    emitConnection("hrm", false, null);
                }
            }
        };

    private void subscribeHrm(AntPlusHeartRatePcc pcc) {
        pcc.subscribeHeartRateDataEvent(
            new AntPlusHeartRatePcc.IHeartRateDataReceiver() {
                @Override
                public void onNewHeartRateData(
                    long estTimestamp,
                    EnumSet<EventFlag> eventFlags,
                    int computedHeartRate,
                    long heartBeatCount,
                    BigDecimal heartBeatEventTime,
                    AntPlusHeartRatePcc.DataState dataState
                ) {
                    JSObject o = new JSObject();
                    o.put("heartRate", computedHeartRate);
                    notifyListeners("hrm", o);
                    emitLog("HRM", "HR: " + computedHeartRate + " bpm");
                }
            }
        );
    }

    // —— Speed / cadence ——

    private final AntPluginPcc.IPluginAccessResultReceiver<AntPlusBikeSpeedDistancePcc> speedAccessReceiver =
        new AntPluginPcc.IPluginAccessResultReceiver<AntPlusBikeSpeedDistancePcc>() {
            @Override
            public void onResultReceived(
                AntPlusBikeSpeedDistancePcc result,
                RequestAccessResult resultCode,
                DeviceState initialDeviceState
            ) {
                PluginCall call = pendingCscCall;
                pendingCscCall = null;
                if (resultCode == RequestAccessResult.SUCCESS && result != null) {
                    speedPcc = result;
                    String name = deviceLabel(result, "ANT+ Speed");
                    subscribeSpeed(result);
                    if (result.isSpeedAndCadenceCombinedSensor()) {
                        connectCombinedCadence(result.getAntDeviceNumber());
                        name = name + " (S&C)";
                    } else {
                        // Also offer a cadence-only search path: secondary silent connect not required.
                        // Pure speed sensors still count as CSC success (speed only).
                    }
                    emitConnection("csc", true, name);
                    emitLog("CSC", "Connected: " + name);
                    resolvePending(call, true, name, null);
                } else {
                    String err = accessError("CSC", resultCode);
                    emitLog("SYSTEM", err);
                    resolvePending(call, false, null, err);
                }
            }
        };

    private final AntPluginPcc.IDeviceStateChangeReceiver speedStateReceiver =
        new AntPluginPcc.IDeviceStateChangeReceiver() {
            @Override
            public void onDeviceStateChange(final DeviceState newDeviceState) {
                if (newDeviceState == DeviceState.DEAD || newDeviceState == DeviceState.CLOSED) {
                    emitLog("CSC", "Speed sensor disconnected (" + newDeviceState + ")");
                    speedPcc = null;
                    emitConnection("csc", false, null);
                }
            }
        };

    private void subscribeSpeed(AntPlusBikeSpeedDistancePcc pcc) {
        pcc.subscribeCalculatedSpeedEvent(
            new AntPlusBikeSpeedDistancePcc.CalculatedSpeedReceiver(WHEEL_CIRCUMFERENCE_M) {
                @Override
                public void onNewCalculatedSpeed(
                    long estTimestamp,
                    EnumSet<EventFlag> eventFlags,
                    BigDecimal calculatedSpeed
                ) {
                    // PluginLib calculated speed is m/s
                    double mps = calculatedSpeed != null ? calculatedSpeed.doubleValue() : 0;
                    double kmh = Math.round(mps * 3.6 * 10.0) / 10.0;
                    JSObject o = new JSObject();
                    o.put("speed", kmh);
                    notifyListeners("csc", o);
                    emitLog("CSC", "Speed: " + kmh + " km/h");
                }
            }
        );
    }

    private void connectCombinedCadence(int antDeviceNumber) {
        Activity activity = getActivity();
        if (activity == null) return;
        if (cadenceHandle != null) {
            cadenceHandle.close();
            cadenceHandle = null;
        }
        cadenceHandle = AntPlusBikeCadencePcc.requestAccess(
            activity,
            antDeviceNumber,
            0,
            true,
            new AntPluginPcc.IPluginAccessResultReceiver<AntPlusBikeCadencePcc>() {
                @Override
                public void onResultReceived(
                    AntPlusBikeCadencePcc result,
                    RequestAccessResult resultCode,
                    DeviceState initialDeviceState
                ) {
                    if (resultCode == RequestAccessResult.SUCCESS && result != null) {
                        cadencePcc = result;
                        result.subscribeCalculatedCadenceEvent(
                            new AntPlusBikeCadencePcc.ICalculatedCadenceReceiver() {
                                @Override
                                public void onNewCalculatedCadence(
                                    long estTimestamp,
                                    EnumSet<EventFlag> eventFlags,
                                    BigDecimal calculatedCadence
                                ) {
                                    int rpm =
                                        calculatedCadence != null
                                            ? (int) Math.round(calculatedCadence.doubleValue())
                                            : 0;
                                    JSObject o = new JSObject();
                                    o.put("cadence", rpm);
                                    notifyListeners("csc", o);
                                    emitLog("CSC", "Cadence: " + rpm + " rpm");
                                }
                            }
                        );
                        emitLog("CSC", "Combined cadence channel open");
                    }
                }
            },
            new AntPluginPcc.IDeviceStateChangeReceiver() {
                @Override
                public void onDeviceStateChange(DeviceState newDeviceState) {
                    if (newDeviceState == DeviceState.DEAD || newDeviceState == DeviceState.CLOSED) {
                        cadencePcc = null;
                    }
                }
            }
        );
    }

    // —— Power ——

    private final AntPluginPcc.IPluginAccessResultReceiver<AntPlusBikePowerPcc> powerAccessReceiver =
        new AntPluginPcc.IPluginAccessResultReceiver<AntPlusBikePowerPcc>() {
            @Override
            public void onResultReceived(
                AntPlusBikePowerPcc result,
                RequestAccessResult resultCode,
                DeviceState initialDeviceState
            ) {
                PluginCall call = pendingPowerCall;
                pendingPowerCall = null;
                if (resultCode == RequestAccessResult.SUCCESS && result != null) {
                    powerPcc = result;
                    String name = deviceLabel(result, "ANT+ Power");
                    subscribePower(result);
                    emitConnection("power", true, name);
                    emitLog("POWER", "Connected: " + name);
                    resolvePending(call, true, name, null);
                } else {
                    String err = accessError("POWER", resultCode);
                    emitLog("SYSTEM", err);
                    resolvePending(call, false, null, err);
                }
            }
        };

    private final AntPluginPcc.IDeviceStateChangeReceiver powerStateReceiver =
        new AntPluginPcc.IDeviceStateChangeReceiver() {
            @Override
            public void onDeviceStateChange(final DeviceState newDeviceState) {
                if (newDeviceState == DeviceState.DEAD || newDeviceState == DeviceState.CLOSED) {
                    emitLog("POWER", "Disconnected (" + newDeviceState + ")");
                    powerPcc = null;
                    emitConnection("power", false, null);
                }
            }
        };

    private void subscribePower(AntPlusBikePowerPcc pcc) {
        pcc.subscribeCalculatedPowerEvent(
            new AntPlusBikePowerPcc.ICalculatedPowerReceiver() {
                @Override
                public void onNewCalculatedPower(
                    long estTimestamp,
                    EnumSet<EventFlag> eventFlags,
                    AntPlusBikePowerPcc.DataSource dataSource,
                    BigDecimal calculatedPower
                ) {
                    int watts =
                        calculatedPower != null
                            ? Math.max(0, (int) Math.round(calculatedPower.doubleValue()))
                            : 0;
                    JSObject o = new JSObject();
                    o.put("power", watts);
                    notifyListeners("power", o);
                    emitLog("POWER", "Power: " + watts + " W");
                }
            }
        );
    }

    private String accessError(String label, RequestAccessResult resultCode) {
        if (resultCode == RequestAccessResult.USER_CANCELLED) {
            return label + ": search cancelled";
        }
        if (resultCode == RequestAccessResult.DEPENDENCY_NOT_INSTALLED) {
            return label + ": ANT+ Plugins Service missing — install from Play Store";
        }
        if (resultCode == RequestAccessResult.SEARCH_TIMEOUT) {
            return label + ": no ANT+ device found";
        }
        return label + ": " + (resultCode != null ? resultCode.toString() : "access failed");
    }

    private void releaseHrm() {
        if (pendingHrmCall != null) {
            resolvePending(pendingHrmCall, false, null, "HRM: disconnected");
            pendingHrmCall = null;
        }
        if (hrmHandle != null) {
            hrmHandle.close();
            hrmHandle = null;
        }
        hrmPcc = null;
    }

    private void releaseCsc() {
        if (pendingCscCall != null) {
            resolvePending(pendingCscCall, false, null, "CSC: disconnected");
            pendingCscCall = null;
        }
        if (cadenceHandle != null) {
            cadenceHandle.close();
            cadenceHandle = null;
        }
        cadencePcc = null;
        if (speedHandle != null) {
            speedHandle.close();
            speedHandle = null;
        }
        speedPcc = null;
    }

    private void releasePower() {
        if (pendingPowerCall != null) {
            resolvePending(pendingPowerCall, false, null, "POWER: disconnected");
            pendingPowerCall = null;
        }
        if (powerHandle != null) {
            powerHandle.close();
            powerHandle = null;
        }
        powerPcc = null;
    }
}
