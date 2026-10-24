import React, { useEffect, useState } from 'react';
import { bleManager, BlePacketLog } from '../utils/bleManager';
import { antManager, AntPacketLog } from '../utils/antManager';
import { BleDeviceStatus } from '../types/cycling';
import {
  Bluetooth,
  Heart,
  Activity,
  Zap,
  RefreshCw,
  X,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  Terminal,
  Radio
} from 'lucide-react';

interface BleSensorModalProps {
  isOpen: boolean;
  onClose: () => void;
  bleStatus: BleDeviceStatus;
  setBleStatus: React.Dispatch<React.SetStateAction<BleDeviceStatus>>;
}

type MergedLog = (BlePacketLog | AntPacketLog) & { radio: 'BLE' | 'ANT+' };

export const BleSensorModal: React.FC<BleSensorModalProps> = ({
  isOpen,
  onClose,
  bleStatus,
  setBleStatus
}) => {
  const [logs, setLogs] = useState<MergedLog[]>([]);
  const [scanningHrmBle, setScanningHrmBle] = useState(false);
  const [scanningCscBle, setScanningCscBle] = useState(false);
  const [scanningPowerBle, setScanningPowerBle] = useState(false);
  const [scanningHrmAnt, setScanningHrmAnt] = useState(false);
  const [scanningCscAnt, setScanningCscAnt] = useState(false);
  const [scanningPowerAnt, setScanningPowerAnt] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [antAvailable, setAntAvailable] = useState<boolean | null>(null);
  const [antAvailError, setAntAvailError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    void antManager.isAvailable().then(r => {
      setAntAvailable(r.available);
      setAntAvailError(r.error || null);
    });
  }, [isOpen]);

  useEffect(() => {
    let bleLogs: BlePacketLog[] = [];
    let antLogs: AntPacketLog[] = [];
    const merge = () => {
      const merged: MergedLog[] = [
        ...bleLogs.map(l => ({ ...l, radio: 'BLE' as const })),
        ...antLogs.map(l => ({ ...l, radio: 'ANT+' as const }))
      ].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      setLogs(merged.slice(0, 50));
    };
    const unsubBle = bleManager.subscribeLogs(newLogs => {
      bleLogs = newLogs;
      merge();
    });
    const unsubAnt = antManager.subscribeLogs(newLogs => {
      antLogs = newLogs;
      merge();
    });
    return () => {
      unsubBle();
      unsubAnt();
    };
  }, []);

  if (!isOpen) return null;

  const isBleSupported = bleManager.isSupported();
  const isAntSupported = antManager.isSupported();
  const anyConnected =
    bleStatus.hrmConnected || bleStatus.cscConnected || bleStatus.powerConnected;

  const protocolBadge = (protocol?: BleDeviceStatus['hrmProtocol']) => {
    if (!protocol) return null;
    return (
      <span
        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
          protocol === 'ant'
            ? 'bg-violet-950 text-violet-300 border-violet-700'
            : 'bg-sky-950 text-sky-300 border-sky-700'
        }`}
      >
        {protocol === 'ant' ? 'ANT+' : 'BLE'}
      </span>
    );
  };

  const handleConnectHrmBle = async () => {
    setScanningHrmBle(true);
    setErrorMsg(null);
    await antManager.disconnectHeartRate();
    const res = await bleManager.connectHeartRate();
    setScanningHrmBle(false);
    if (res.success) {
      setBleStatus(prev => ({
        ...prev,
        hrmConnected: true,
        hrmDeviceName: res.deviceName || 'Heart Rate Monitor',
        hrmProtocol: 'ble'
      }));
    } else if (res.error) {
      setErrorMsg(`HRM BLE: ${res.error}`);
    }
  };

  const handleConnectHrmAnt = async () => {
    setScanningHrmAnt(true);
    setErrorMsg(null);
    await bleManager.disconnectHeartRate();
    const res = await antManager.connectHeartRate();
    setScanningHrmAnt(false);
    if (res.success) {
      setBleStatus(prev => ({
        ...prev,
        hrmConnected: true,
        hrmDeviceName: res.deviceName || 'ANT+ Heart Rate',
        hrmProtocol: 'ant'
      }));
    } else if (res.error) {
      setErrorMsg(`HRM ANT+: ${res.error}`);
    }
  };

  const handleConnectCscBle = async () => {
    setScanningCscBle(true);
    setErrorMsg(null);
    await antManager.disconnectCadenceSpeed();
    const res = await bleManager.connectCadenceSpeed();
    setScanningCscBle(false);
    if (res.success) {
      setBleStatus(prev => ({
        ...prev,
        cscConnected: true,
        cscDeviceName: res.deviceName || 'Speed & Cadence Sensor',
        cscProtocol: 'ble'
      }));
    } else if (res.error) {
      setErrorMsg(`CSC BLE: ${res.error}`);
    }
  };

  const handleConnectCscAnt = async () => {
    setScanningCscAnt(true);
    setErrorMsg(null);
    await bleManager.disconnectCadenceSpeed();
    const res = await antManager.connectCadenceSpeed();
    setScanningCscAnt(false);
    if (res.success) {
      setBleStatus(prev => ({
        ...prev,
        cscConnected: true,
        cscDeviceName: res.deviceName || 'ANT+ Speed/Cadence',
        cscProtocol: 'ant'
      }));
    } else if (res.error) {
      setErrorMsg(`CSC ANT+: ${res.error}`);
    }
  };

  const handleConnectPowerBle = async () => {
    setScanningPowerBle(true);
    setErrorMsg(null);
    await antManager.disconnectPowerMeter();
    const res = await bleManager.connectPowerMeter();
    setScanningPowerBle(false);
    if (res.success) {
      setBleStatus(prev => ({
        ...prev,
        powerConnected: true,
        powerDeviceName: res.deviceName || 'Cycling Power Meter',
        powerProtocol: 'ble'
      }));
    } else if (res.error) {
      setErrorMsg(`Power BLE: ${res.error}`);
    }
  };

  const handleConnectPowerAnt = async () => {
    setScanningPowerAnt(true);
    setErrorMsg(null);
    await bleManager.disconnectPowerMeter();
    const res = await antManager.connectPowerMeter();
    setScanningPowerAnt(false);
    if (res.success) {
      setBleStatus(prev => ({
        ...prev,
        powerConnected: true,
        powerDeviceName: res.deviceName || 'ANT+ Power',
        powerProtocol: 'ant'
      }));
    } else if (res.error) {
      setErrorMsg(`Power ANT+: ${res.error}`);
    }
  };

  const handleDisconnectAll = async () => {
    await Promise.all([bleManager.disconnectAll(), antManager.disconnectAll()]);
    setBleStatus({
      hrmConnected: false,
      cscConnected: false,
      powerConnected: false,
      hrmDeviceName: undefined,
      cscDeviceName: undefined,
      powerDeviceName: undefined,
      hrmProtocol: null,
      cscProtocol: null,
      powerProtocol: null
    });
  };

  const antPairDisabled = !isAntSupported || antAvailable === false;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 bg-zinc-800/80 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-sports tracking-wide">
                SENSOR HARDWARE MANAGER
              </h2>
              <p className="text-xs text-zinc-400">
                BLE (0x180D / 0x1816 / 0x1818) + ANT+ HR / CSC / Power
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-sm text-zinc-200">
          {!isBleSupported && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-300">
                <p className="font-semibold text-amber-300">Bluetooth LE Unavailable</p>
                <p className="mt-0.5">
                  Use the Android app build or a Chromium browser with Web Bluetooth.
                </p>
              </div>
            </div>
          )}

          {isAntSupported && antAvailable === false && (
            <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-3 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-violet-300 shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-300">
                <p className="font-semibold text-violet-200">ANT+ services missing</p>
                <p className="mt-0.5">
                  {antAvailError ||
                    'Install ANT Radio Service and ANT+ Plugins Service from Google Play.'}
                </p>
              </div>
            </div>
          )}

          {!isAntSupported && (
            <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-3 text-xs text-zinc-400">
              ANT+ pairing is only available in the Android app. Dual-mode sensors can still pair
              over BLE here.
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="bg-zinc-800/50 border border-zinc-700 p-3 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-5 h-5 text-blue-400" />
              <div>
                <div className="font-medium text-xs text-zinc-200">Hardware sensor bus</div>
                <div className="text-[11px] text-zinc-400">
                  {anyConnected
                    ? 'Live BLE / ANT+ telemetry active'
                    : 'No sensors connected. Pair BLE or ANT+ per sensor role.'}
                </div>
              </div>
            </div>
            <span
              className={`text-[11px] px-2.5 py-1 rounded-full font-bold border ${
                anyConnected
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}
            >
              {anyConnected ? 'SENSORS ACTIVE' : 'AWAITING PAIR'}
            </span>
          </div>

          <div className="space-y-2.5">
            {/* HR */}
            <div className="bg-zinc-800/70 border border-zinc-700/80 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
                  <Heart className="w-5 h-5 fill-current" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-zinc-100 flex items-center gap-1.5 flex-wrap">
                    Heart rate
                    {bleStatus.hrmConnected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {protocolBadge(bleStatus.hrmProtocol)}
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    {bleStatus.hrmConnected
                      ? bleStatus.hrmDeviceName
                      : 'Garmin, Magene, Polar, Wahoo (BLE or ANT+)'}
                  </div>
                </div>
              </div>
              {!bleStatus.hrmConnected && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConnectHrmBle}
                    disabled={scanningHrmBle || !isBleSupported}
                    className="flex-1 min-h-10 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {scanningHrmBle ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Bluetooth className="w-3.5 h-3.5" />
                    )}
                    Pair BLE
                  </button>
                  <button
                    type="button"
                    onClick={handleConnectHrmAnt}
                    disabled={scanningHrmAnt || antPairDisabled}
                    className="flex-1 min-h-10 px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:bg-zinc-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {scanningHrmAnt ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Radio className="w-3.5 h-3.5" />
                    )}
                    Pair ANT+
                  </button>
                </div>
              )}
              {bleStatus.hrmConnected && (
                <span className="inline-block text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-md border border-emerald-800">
                  Connected
                </span>
              )}
            </div>

            {/* CSC */}
            <div className="bg-zinc-800/70 border border-zinc-700/80 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-zinc-100 flex items-center gap-1.5 flex-wrap">
                    Speed & cadence
                    {bleStatus.cscConnected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {protocolBadge(bleStatus.cscProtocol)}
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    {bleStatus.cscConnected
                      ? bleStatus.cscDeviceName
                      : 'Magene S3+, Wahoo RPM, Garmin (BLE or ANT+)'}
                  </div>
                </div>
              </div>
              {!bleStatus.cscConnected && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConnectCscBle}
                    disabled={scanningCscBle || !isBleSupported}
                    className="flex-1 min-h-10 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {scanningCscBle ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Bluetooth className="w-3.5 h-3.5" />
                    )}
                    Pair BLE
                  </button>
                  <button
                    type="button"
                    onClick={handleConnectCscAnt}
                    disabled={scanningCscAnt || antPairDisabled}
                    className="flex-1 min-h-10 px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:bg-zinc-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {scanningCscAnt ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Radio className="w-3.5 h-3.5" />
                    )}
                    Pair ANT+
                  </button>
                </div>
              )}
              {bleStatus.cscConnected && (
                <span className="inline-block text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-md border border-emerald-800">
                  Connected
                </span>
              )}
            </div>

            {/* Power */}
            <div className="bg-zinc-800/70 border border-zinc-700/80 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-zinc-100 flex items-center gap-1.5 flex-wrap">
                    Power meter
                    {bleStatus.powerConnected && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    {protocolBadge(bleStatus.powerProtocol)}
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    {bleStatus.powerConnected
                      ? bleStatus.powerDeviceName
                      : 'Magene, Assioma, Stages, SRAM (BLE or ANT+)'}
                  </div>
                </div>
              </div>
              {!bleStatus.powerConnected && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConnectPowerBle}
                    disabled={scanningPowerBle || !isBleSupported}
                    className="flex-1 min-h-10 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {scanningPowerBle ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Bluetooth className="w-3.5 h-3.5" />
                    )}
                    Pair BLE
                  </button>
                  <button
                    type="button"
                    onClick={handleConnectPowerAnt}
                    disabled={scanningPowerAnt || antPairDisabled}
                    className="flex-1 min-h-10 px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:bg-zinc-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {scanningPowerAnt ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Radio className="w-3.5 h-3.5" />
                    )}
                    Pair ANT+
                  </button>
                </div>
              )}
              {bleStatus.powerConnected && (
                <span className="inline-block text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-md border border-emerald-800">
                  Connected
                </span>
              )}
            </div>
          </div>

          <div className="bg-black border border-zinc-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-zinc-800">
              <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>LIVE SENSOR STREAM</span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">{logs.length} events</span>
            </div>
            <div className="h-28 overflow-y-auto font-mono text-[11px] space-y-1 text-zinc-400">
              {logs.length === 0 ? (
                <div className="text-zinc-600 italic">
                  No packets yet. Pair BLE or ANT+ hardware.
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-zinc-600 text-[10px]">{log.timestamp}</span>
                    <span
                      className={`font-bold text-[10px] px-1 rounded ${
                        log.radio === 'ANT+'
                          ? 'bg-violet-950 text-violet-300'
                          : 'bg-sky-950 text-sky-300'
                      }`}
                    >
                      {log.radio}
                    </span>
                    <span
                      className={`font-bold text-[10px] px-1 rounded ${
                        log.source === 'HRM'
                          ? 'bg-red-950 text-red-400'
                          : log.source === 'CSC'
                            ? 'bg-blue-950 text-blue-400'
                            : log.source === 'POWER'
                              ? 'bg-amber-950 text-amber-400'
                              : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {log.source}
                    </span>
                    <span className="text-zinc-300">{log.data}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-4 bg-zinc-800/80 border-t border-zinc-700 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDisconnectAll}
            className="text-xs text-red-400 hover:text-red-300 transition-colors font-medium"
          >
            Disconnect all devices
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
