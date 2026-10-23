import React, { useEffect, useState } from 'react';
import { bleManager, BlePacketLog } from '../utils/bleManager';
import { BleDeviceStatus } from '../types/cycling';
import { Bluetooth, Heart, Activity, Zap, RefreshCw, X, ShieldAlert, Cpu, CheckCircle2, Terminal } from 'lucide-react';

interface BleSensorModalProps {
  isOpen: boolean;
  onClose: () => void;
  bleStatus: BleDeviceStatus;
  setBleStatus: React.Dispatch<React.SetStateAction<BleDeviceStatus>>;
}

export const BleSensorModal: React.FC<BleSensorModalProps> = ({
  isOpen,
  onClose,
  bleStatus,
  setBleStatus
}) => {
  const [logs, setLogs] = useState<BlePacketLog[]>([]);
  const [scanningHrm, setScanningHrm] = useState(false);
  const [scanningCsc, setScanningCsc] = useState(false);
  const [scanningPower, setScanningPower] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = bleManager.subscribeLogs(newLogs => {
      setLogs([...newLogs]);
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleConnectHrm = async () => {
    setScanningHrm(true);
    setErrorMsg(null);
    const res = await bleManager.connectHeartRate();
    setScanningHrm(false);
    if (res.success) {
      setBleStatus(prev => ({
        ...prev,
        hrmConnected: true,
        hrmDeviceName: res.deviceName || 'Heart Rate Monitor'
      }));
    } else if (res.error) {
      setErrorMsg(`HRM: ${res.error}`);
    }
  };

  const handleConnectCsc = async () => {
    setScanningCsc(true);
    setErrorMsg(null);
    const res = await bleManager.connectCadenceSpeed();
    setScanningCsc(false);
    if (res.success) {
      setBleStatus(prev => ({
        ...prev,
        cscConnected: true,
        cscDeviceName: res.deviceName || 'Speed & Cadence Sensor'
      }));
    } else if (res.error) {
      setErrorMsg(`CSC: ${res.error}`);
    }
  };

  const handleConnectPower = async () => {
    setScanningPower(true);
    setErrorMsg(null);
    const res = await bleManager.connectPowerMeter();
    setScanningPower(false);
    if (res.success) {
      setBleStatus(prev => ({
        ...prev,
        powerConnected: true,
        powerDeviceName: res.deviceName || 'Cycling Power Meter'
      }));
    } else if (res.error) {
      setErrorMsg(`Power: ${res.error}`);
    }
  };

  const handleDisconnectAll = async () => {
    await bleManager.disconnectAll();
    setBleStatus({
      hrmConnected: false,
      cscConnected: false,
      powerConnected: false,
      hrmDeviceName: undefined,
      cscDeviceName: undefined,
      powerDeviceName: undefined
    });
  };

  const isBleSupported = bleManager.isSupported();

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-zinc-800/80 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Bluetooth className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-sports tracking-wide">
                BLUETOOTH LOW ENERGY HARDWARE MANAGER
              </h2>
              <p className="text-xs text-zinc-400">
                Native Capacitor BLE pairing (0x180D, 0x1816, 0x1818)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-zinc-200">
          {!isBleSupported && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-300">
                <p className="font-semibold text-amber-300">Bluetooth LE Unavailable</p>
                <p className="mt-0.5">
                  This platform cannot access Bluetooth LE. Use the Android app build (Capacitor) or a desktop Chromium browser with BLE support.
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Real-time Hardware Connectivity Banner */}
          <div className="bg-zinc-800/50 border border-zinc-750 p-3 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-5 h-5 text-blue-400" />
              <div>
                <div className="font-medium text-xs text-zinc-200">Hardware Sensor Bus</div>
                <div className="text-[11px] text-zinc-400">
                  {bleStatus.hrmConnected || bleStatus.cscConnected || bleStatus.powerConnected
                    ? 'Active Real-Time Hardware GATT Streams'
                    : 'No sensors connected yet. Click Pair to scan nearby cycling devices.'}
                </div>
              </div>
            </div>
            <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold border ${
              bleStatus.hrmConnected || bleStatus.cscConnected || bleStatus.powerConnected
                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}>
              {bleStatus.hrmConnected || bleStatus.cscConnected || bleStatus.powerConnected ? 'SENSORS ACTIVE' : 'AWAITING PAIR'}
            </span>
          </div>

          {/* Sensor Pairing Cards */}
          <div className="space-y-2.5">
            {/* 1. Heart Rate Monitor */}
            <div className="bg-zinc-800/70 border border-zinc-700/80 rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/15 text-red-400 flex items-center justify-center">
                  <Heart className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                    Heart Rate Monitor (0x180D)
                    {bleStatus.hrmConnected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {bleStatus.hrmConnected ? bleStatus.hrmDeviceName : 'Garmin, Magene H64/H603, Polar, Wahoo TICKR'}
                  </div>
                </div>
              </div>

              <div>
                {bleStatus.hrmConnected ? (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-md border border-emerald-800">
                    Connected
                  </span>
                ) : (
                  <button
                    onClick={handleConnectHrm}
                    disabled={scanningHrm}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    {scanningHrm ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5" />}
                    Pair HRM
                  </button>
                )}
              </div>
            </div>

            {/* 2. Cycling Speed & Cadence Sensor */}
            <div className="bg-zinc-800/70 border border-zinc-700/80 rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                    Speed & Cadence (0x1816)
                    {bleStatus.cscConnected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {bleStatus.cscConnected ? bleStatus.cscDeviceName : 'Magene S3+, Wahoo RPM, Garmin Speed 2'}
                  </div>
                </div>
              </div>

              <div>
                {bleStatus.cscConnected ? (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-md border border-emerald-800">
                    Connected
                  </span>
                ) : (
                  <button
                    onClick={handleConnectCsc}
                    disabled={scanningCsc}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    {scanningCsc ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5" />}
                    Pair CSC
                  </button>
                )}
              </div>
            </div>

            {/* 3. Cycling Power Meter */}
            <div className="bg-zinc-800/70 border border-zinc-700/80 rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                    Cycling Power Meter (0x1818)
                    {bleStatus.powerConnected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {bleStatus.powerConnected ? bleStatus.powerDeviceName : 'Magene P505, Favero Assioma, Stages, SRAM AXS'}
                  </div>
                </div>
              </div>

              <div>
                {bleStatus.powerConnected ? (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-md border border-emerald-800">
                    Connected
                  </span>
                ) : (
                  <button
                    onClick={handleConnectPower}
                    disabled={scanningPower}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    {scanningPower ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5" />}
                    Pair Power
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Live BLE Packet Terminal Inspector */}
          <div className="bg-black border border-zinc-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-zinc-800">
              <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>LIVE GATT DATA STREAM</span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">
                {logs.length} Packets Received
              </span>
            </div>
            <div className="h-28 overflow-y-auto font-mono text-[11px] space-y-1 text-zinc-400">
              {logs.length === 0 ? (
                <div className="text-zinc-600 italic">No BLE packets received yet. Pair hardware or run simulator.</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span className="text-zinc-600 text-[10px]">{log.timestamp}</span>
                    <span className={`font-bold text-[10px] px-1 rounded ${
                      log.source === 'HRM' ? 'bg-red-950 text-red-400' :
                      log.source === 'CSC' ? 'bg-blue-950 text-blue-400' :
                      log.source === 'POWER' ? 'bg-amber-950 text-amber-400' :
                      'bg-zinc-800 text-zinc-300'
                    }`}>
                      {log.source}
                    </span>
                    <span className="text-zinc-300">{log.data}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-800/80 border-t border-zinc-700 flex items-center justify-between">
          <button
            onClick={handleDisconnectAll}
            className="text-xs text-red-400 hover:text-red-300 transition-colors font-medium"
          >
            Disconnect All Devices
          </button>
          <button
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
