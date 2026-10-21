/**
 * Real Web Bluetooth Low Energy (BLE) Manager for standard cycling sensors
 * Supports:
 * - Heart Rate Monitors (GATT 0x180D / 0x2A37)
 * - Cycling Speed & Cadence Sensors (GATT 0x1816 / 0x2A5B)
 * - Cycling Power Meters (GATT 0x1818 / 0x2A63)
 * - Device Battery Level (GATT 0x180F / 0x2A19)
 */

// Ambient typing support for Web Bluetooth API
declare global {
  interface Navigator {
    bluetooth?: any;
  }
}

type BleDevice = any;

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
  private hrmDevice: BleDevice | null = null;
  private cscDevice: BleDevice | null = null;
  private powerDevice: BleDevice | null = null;

  private prevCrankRevs: number | null = null;
  private prevCrankTime: number | null = null;
  private prevWheelRevs: number | null = null;
  private prevWheelTime: number | null = null;
  private wheelCircumferenceMeters: number = 2.105; // 700x25c standard road tire

  private listeners: Set<BleCallback> = new Set();
  public packetLogs: BlePacketLog[] = [];
  private logListeners: Set<(logs: BlePacketLog[]) => void> = new Set();

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
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

  private notify(data: { heartRate?: number; cadence?: number; speed?: number; power?: number; batteryLevel?: number }) {
    this.listeners.forEach(cb => cb(data));
  }

  /**
   * Connect to Heart Rate Monitor (0x180D)
   */
  public async connectHeartRate(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!this.isSupported()) {
      return { success: false, error: 'Web Bluetooth is not supported in this browser.' };
    }

    try {
      this.addLog('SYSTEM', 'Scanning for Bluetooth Heart Rate Monitors (0x180D)...');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
        optionalServices: ['battery_service']
      });

      this.hrmDevice = device;
      device.addEventListener('gattserverdisconnected', () => {
        this.addLog('HRM', `Disconnected: ${device.name || 'HRM'}`);
      });

      const server = await device.gatt?.connect();
      if (!server) throw new Error('Could not connect to GATT Server.');

      const service = await server.getPrimaryService('heart_rate');
      const char = await service.getCharacteristic('heart_rate_measurement');
      await char.startNotifications();

      char.addEventListener('characteristicvaluechanged', (event: any) => {
        const val: DataView = event.target.value;
        const flags = val.getUint8(0);
        const is16Bit = (flags & 0x01) !== 0;
        const hr = is16Bit ? val.getUint16(1, true) : val.getUint8(1);
        this.notify({ heartRate: hr });
        this.addLog('HRM', `HR: ${hr} bpm (Flags: 0x${flags.toString(16)})`);
      });

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
      return { success: false, error: 'Web Bluetooth is not supported in this browser.' };
    }

    try {
      this.addLog('SYSTEM', 'Scanning for Cycling Speed & Cadence (0x1816)...');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['cycling_speed_and_cadence'] }],
        optionalServices: ['battery_service']
      });

      this.cscDevice = device;
      const server = await device.gatt?.connect();
      if (!server) throw new Error('Could not connect to CSC GATT.');

      const service = await server.getPrimaryService('cycling_speed_and_cadence');
      const char = await service.getCharacteristic('csc_measurement');
      await char.startNotifications();

      char.addEventListener('characteristicvaluechanged', (event: any) => {
        const val: DataView = event.target.value;
        const flags = val.getUint8(0);
        let offset = 1;

        let speedKmh: number | undefined;
        let cadenceRpm: number | undefined;

        // Wheel Revolutions Present (bit 0)
        if (flags & 0x01) {
          const wheelRevs = val.getUint32(offset, true);
          offset += 4;
          const wheelTime = val.getUint16(offset, true); // in 1/1024 s
          offset += 2;

          if (this.prevWheelRevs !== null && this.prevWheelTime !== null) {
            let dRevs = wheelRevs - this.prevWheelRevs;
            let dTime = (wheelTime - this.prevWheelTime) / 1024;
            if (dTime < 0) dTime += 65536 / 1024; // 16-bit rollover
            if (dTime > 0 && dRevs >= 0) {
              const metersPerSec = (dRevs * this.wheelCircumferenceMeters) / dTime;
              speedKmh = Math.round(metersPerSec * 3.6 * 10) / 10;
            }
          }
          this.prevWheelRevs = wheelRevs;
          this.prevWheelTime = wheelTime;
        }

        // Crank Revolutions Present (bit 1)
        if (flags & 0x02) {
          const crankRevs = val.getUint16(offset, true);
          offset += 2;
          const crankTime = val.getUint16(offset, true); // in 1/1024 s
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
      });

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
      return { success: false, error: 'Web Bluetooth is not supported in this browser.' };
    }

    try {
      this.addLog('SYSTEM', 'Scanning for Cycling Power Meter (0x1818)...');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['cycling_power'] }],
        optionalServices: ['battery_service']
      });

      this.powerDevice = device;
      const server = await device.gatt?.connect();
      if (!server) throw new Error('Could not connect to Power GATT.');

      const service = await server.getPrimaryService('cycling_power');
      const char = await service.getCharacteristic('cycling_power_measurement');
      await char.startNotifications();

      char.addEventListener('characteristicvaluechanged', (event: any) => {
        const val: DataView = event.target.value;
        const flags = val.getUint16(0, true);
        const powerWatts = val.getInt16(2, true);
        this.notify({ power: Math.max(0, powerWatts) });
        this.addLog('POWER', `Power: ${powerWatts} Watts (Flags: 0x${flags.toString(16)})`);
      });

      this.addLog('POWER', `Connected: ${device.name || 'Power Meter'}`);
      return { success: true, deviceName: device.name || 'BLE Power Meter' };
    } catch (err: any) {
      this.addLog('SYSTEM', `Power Scan cancelled or failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  public disconnectAll() {
    if (this.hrmDevice?.gatt?.connected) this.hrmDevice.gatt.disconnect();
    if (this.cscDevice?.gatt?.connected) this.cscDevice.gatt.disconnect();
    if (this.powerDevice?.gatt?.connected) this.powerDevice.gatt.disconnect();
    this.addLog('SYSTEM', 'All BLE hardware sensors disconnected.');
  }
}

export const bleManager = new BleManager();
