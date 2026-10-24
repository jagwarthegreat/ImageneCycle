/**
 * Capacitor native BLE manager for standard cycling sensors
 * (via @capacitor-community/bluetooth-le)
 * Supports:
 * - Heart Rate Monitors (GATT 0x180D / 0x2A37)
 * - Cycling Speed & Cadence Sensors (GATT 0x1816 / 0x2A5B)
 * - Cycling Power Meters (GATT 0x1818 / 0x2A63)
 */

import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';
const CSC_SERVICE = '00001816-0000-1000-8000-00805f9b34fb';
const CSC_MEASUREMENT = '00002a5b-0000-1000-8000-00805f9b34fb';
const POWER_SERVICE = '00001818-0000-1000-8000-00805f9b34fb';
const POWER_MEASUREMENT = '00002a63-0000-1000-8000-00805f9b34fb';

export interface BlePacketLog {
  timestamp: string;
  source: 'HRM' | 'CSC' | 'POWER' | 'SYSTEM';
  data: string;
}

export type BleCallback = (data: {
  heartRate?: number;
  cadence?: number;
  speed?: number;
  power?: number;
  batteryLevel?: number;
}) => void;

class BleManager {
  private hrmDeviceId: string | null = null;
  private cscDeviceId: string | null = null;
  private powerDeviceId: string | null = null;

  private prevCrankRevs: number | null = null;
  private prevCrankTime: number | null = null;
  private prevWheelRevs: number | null = null;
  private prevWheelTime: number | null = null;
  private wheelCircumferenceMeters: number = 2.105; // 700x25c standard road tire

  private listeners: Set<BleCallback> = new Set();
  public packetLogs: BlePacketLog[] = [];
  private logListeners: Set<(logs: BlePacketLog[]) => void> = new Set();
  private initialized = false;

  public isSupported(): boolean {
    return Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'web';
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await BleClient.initialize({ androidNeverForLocation: true });
    this.initialized = true;
  }

  public subscribe(cb: BleCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public subscribeLogs(cb: (logs: BlePacketLog[]) => void): () => void {
    this.logListeners.add(cb);
    cb(this.packetLogs);
    return () => this.logListeners.delete(cb);
  }

  private addLog(source: 'HRM' | 'CSC' | 'POWER' | 'SYSTEM', data: string) {
    const time = new Date().toTimeString().split(' ')[0];
    this.packetLogs = [{ timestamp: time, source, data }, ...this.packetLogs.slice(0, 49)];
    this.logListeners.forEach(cb => cb(this.packetLogs));
  }

  private notify(data: {
    heartRate?: number;
    cadence?: number;
    speed?: number;
    power?: number;
    batteryLevel?: number;
  }) {
    this.listeners.forEach(cb => cb(data));
  }

  private parseHeartRate(val: DataView) {
    const flags = val.getUint8(0);
    const is16Bit = (flags & 0x01) !== 0;
    const hr = is16Bit ? val.getUint16(1, true) : val.getUint8(1);
    this.notify({ heartRate: hr });
    this.addLog('HRM', `HR: ${hr} bpm (Flags: 0x${flags.toString(16)})`);
  }

  private parseCsc(val: DataView) {
    const flags = val.getUint8(0);
    let offset = 1;

    let speedKmh: number | undefined;
    let cadenceRpm: number | undefined;

    if (flags & 0x01) {
      const wheelRevs = val.getUint32(offset, true);
      offset += 4;
      const wheelTime = val.getUint16(offset, true);
      offset += 2;

      if (this.prevWheelRevs !== null && this.prevWheelTime !== null) {
        let dRevs = wheelRevs - this.prevWheelRevs;
        let dTime = (wheelTime - this.prevWheelTime) / 1024;
        if (dTime < 0) dTime += 65536 / 1024;
        if (dTime > 0 && dRevs >= 0) {
          const metersPerSec = (dRevs * this.wheelCircumferenceMeters) / dTime;
          speedKmh = Math.round(metersPerSec * 3.6 * 10) / 10;
        }
      }
      this.prevWheelRevs = wheelRevs;
      this.prevWheelTime = wheelTime;
    }

    if (flags & 0x02) {
      const crankRevs = val.getUint16(offset, true);
      offset += 2;
      const crankTime = val.getUint16(offset, true);
      offset += 2;

      if (this.prevCrankRevs !== null && this.prevCrankTime !== null) {
        let dRevs = crankRevs - this.prevCrankRevs;
        let dTime = (crankTime - this.prevCrankTime) / 1024;
        if (dTime < 0) dTime += 65536 / 1024;
        if (dTime > 0 && dRevs >= 0) {
          cadenceRpm = Math.round((dRevs / dTime) * 60);
        }
      }
      this.prevCrankRevs = crankRevs;
      this.prevCrankTime = crankTime;
    }

    this.notify({ speed: speedKmh, cadence: cadenceRpm });
    this.addLog('CSC', `Cadence: ${cadenceRpm ?? '--'} rpm | Speed: ${speedKmh ?? '--'} km/h`);
  }

  private parsePower(val: DataView) {
    const flags = val.getUint16(0, true);
    const powerWatts = val.getInt16(2, true);
    this.notify({ power: Math.max(0, powerWatts) });
    this.addLog('POWER', `Power: ${powerWatts} Watts (Flags: 0x${flags.toString(16)})`);
  }

  /**
   * Connect to Heart Rate Monitor (0x180D)
   */
  public async connectHeartRate(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!this.isSupported()) {
      return { success: false, error: 'Bluetooth LE is not available on this platform.' };
    }

    try {
      await this.ensureInitialized();
      this.addLog('SYSTEM', 'Scanning for Bluetooth Heart Rate Monitors (0x180D)...');
      const device = await BleClient.requestDevice({ services: [HEART_RATE_SERVICE] });
      await BleClient.connect(device.deviceId, () => {
        this.addLog('HRM', `Disconnected: ${device.name || 'HRM'}`);
        this.hrmDeviceId = null;
      });
      this.hrmDeviceId = device.deviceId;

      await BleClient.startNotifications(
        device.deviceId,
        HEART_RATE_SERVICE,
        HEART_RATE_MEASUREMENT,
        value => this.parseHeartRate(value)
      );

      this.addLog('HRM', `Connected: ${device.name || 'Heart Rate Monitor'}`);
      return { success: true, deviceName: device.name || 'BLE Heart Rate' };
    } catch (err: any) {
      this.addLog('SYSTEM', `HRM Scan cancelled or failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Connect to Cycling Speed & Cadence Sensor (0x1816)
   */
  public async connectCadenceSpeed(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!this.isSupported()) {
      return { success: false, error: 'Bluetooth LE is not available on this platform.' };
    }

    try {
      await this.ensureInitialized();
      this.addLog('SYSTEM', 'Scanning for Cycling Speed & Cadence (0x1816)...');
      const device = await BleClient.requestDevice({ services: [CSC_SERVICE] });
      await BleClient.connect(device.deviceId, () => {
        this.addLog('CSC', `Disconnected: ${device.name || 'CSC'}`);
        this.cscDeviceId = null;
      });
      this.cscDeviceId = device.deviceId;

      await BleClient.startNotifications(
        device.deviceId,
        CSC_SERVICE,
        CSC_MEASUREMENT,
        value => this.parseCsc(value)
      );

      this.addLog('CSC', `Connected: ${device.name || 'CSC Sensor'}`);
      return { success: true, deviceName: device.name || 'BLE Cadence Sensor' };
    } catch (err: any) {
      this.addLog('SYSTEM', `CSC Scan cancelled or failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Connect to Cycling Power Meter (0x1818)
   */
  public async connectPowerMeter(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!this.isSupported()) {
      return { success: false, error: 'Bluetooth LE is not available on this platform.' };
    }

    try {
      await this.ensureInitialized();
      this.addLog('SYSTEM', 'Scanning for Cycling Power Meter (0x1818)...');
      const device = await BleClient.requestDevice({ services: [POWER_SERVICE] });
      await BleClient.connect(device.deviceId, () => {
        this.addLog('POWER', `Disconnected: ${device.name || 'Power'}`);
        this.powerDeviceId = null;
      });
      this.powerDeviceId = device.deviceId;

      await BleClient.startNotifications(
        device.deviceId,
        POWER_SERVICE,
        POWER_MEASUREMENT,
        value => this.parsePower(value)
      );

      this.addLog('POWER', `Connected: ${device.name || 'Power Meter'}`);
      return { success: true, deviceName: device.name || 'BLE Power Meter' };
    } catch (err: any) {
      this.addLog('SYSTEM', `Power Scan cancelled or failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  private async disconnectSlot(
    id: string | null,
    service: string,
    characteristic: string,
    clear: () => void
  ): Promise<void> {
    if (!id) return;
    try {
      await BleClient.stopNotifications(id, service, characteristic);
    } catch {
      /* already gone */
    }
    try {
      await BleClient.disconnect(id);
    } catch {
      /* already gone */
    }
    clear();
  }

  public async disconnectHeartRate(): Promise<void> {
    await this.disconnectSlot(this.hrmDeviceId, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT, () => {
      this.hrmDeviceId = null;
    });
  }

  public async disconnectCadenceSpeed(): Promise<void> {
    await this.disconnectSlot(this.cscDeviceId, CSC_SERVICE, CSC_MEASUREMENT, () => {
      this.cscDeviceId = null;
    });
  }

  public async disconnectPowerMeter(): Promise<void> {
    await this.disconnectSlot(this.powerDeviceId, POWER_SERVICE, POWER_MEASUREMENT, () => {
      this.powerDeviceId = null;
    });
  }

  public async disconnectAll() {
    await this.disconnectHeartRate();
    await this.disconnectCadenceSpeed();
    await this.disconnectPowerMeter();
    this.addLog('SYSTEM', 'All BLE hardware sensors disconnected.');
  }
}

export const bleManager = new BleManager();
