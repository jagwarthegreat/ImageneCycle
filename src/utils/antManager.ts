/**
 * Android ANT+ sensor manager (Capacitor AntPlusSensors plugin).
 * Profiles: heart rate, bike speed/cadence, bike power.
 */

import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface AntPacketLog {
  timestamp: string;
  source: 'HRM' | 'CSC' | 'POWER' | 'SYSTEM';
  data: string;
}

export type AntCallback = (data: {
  heartRate?: number;
  cadence?: number;
  speed?: number;
  power?: number;
}) => void;

export type AntConnectionCallback = (info: {
  profile: 'hrm' | 'csc' | 'power';
  connected: boolean;
  deviceName?: string;
}) => void;

interface AntPlusSensorsPlugin {
  isAvailable(): Promise<{
    available: boolean;
    antRadioService?: boolean;
    antPluginsService?: boolean;
    error?: string;
  }>;
  searchAndConnect(options: {
    profile: 'hrm' | 'csc' | 'power';
  }): Promise<{ success: boolean; deviceName?: string; error?: string }>;
  disconnect(options: { profile: 'hrm' | 'csc' | 'power' }): Promise<void>;
  disconnectAll(): Promise<void>;
  addListener(
    eventName: 'hrm' | 'csc' | 'power' | 'connection' | 'log',
    listenerFunc: (data: Record<string, unknown>) => void
  ): Promise<PluginListenerHandle>;
}

const AntPlusSensors = registerPlugin<AntPlusSensorsPlugin>('AntPlusSensors');

class AntManager {
  private listeners: Set<AntCallback> = new Set();
  private connectionListeners: Set<AntConnectionCallback> = new Set();
  public packetLogs: AntPacketLog[] = [];
  private logListeners: Set<(logs: AntPacketLog[]) => void> = new Set();
  private nativeListeners: PluginListenerHandle[] = [];
  private wired = false;

  private hrmConnected = false;
  private cscConnected = false;
  private powerConnected = false;

  public isSupported(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  public async isAvailable(): Promise<{
    available: boolean;
    error?: string;
    antRadioService?: boolean;
    antPluginsService?: boolean;
  }> {
    if (!this.isSupported()) {
      return {
        available: false,
        error: 'ANT+ requires the Android app build (not available on web).'
      };
    }
    try {
      await this.ensureWired();
      return await AntPlusSensors.isAvailable();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ANT+ plugin unavailable';
      return { available: false, error: message };
    }
  }

  public subscribe(cb: AntCallback): () => void {
    this.listeners.add(cb);
    void this.ensureWired();
    return () => this.listeners.delete(cb);
  }

  public subscribeConnection(cb: AntConnectionCallback): () => void {
    this.connectionListeners.add(cb);
    void this.ensureWired();
    return () => this.connectionListeners.delete(cb);
  }

  public subscribeLogs(cb: (logs: AntPacketLog[]) => void): () => void {
    this.logListeners.add(cb);
    cb(this.packetLogs);
    void this.ensureWired();
    return () => this.logListeners.delete(cb);
  }

  private addLog(source: AntPacketLog['source'], data: string) {
    const time = new Date().toTimeString().split(' ')[0];
    this.packetLogs = [{ timestamp: time, source, data }, ...this.packetLogs.slice(0, 49)];
    this.logListeners.forEach(cb => cb(this.packetLogs));
  }

  private notify(data: {
    heartRate?: number;
    cadence?: number;
    speed?: number;
    power?: number;
  }) {
    this.listeners.forEach(cb => cb(data));
  }

  private async ensureWired(): Promise<void> {
    if (this.wired || !this.isSupported()) return;
    this.wired = true;
    try {
      this.nativeListeners.push(
        await AntPlusSensors.addListener('hrm', data => {
          if (typeof data.heartRate === 'number') {
            this.notify({ heartRate: data.heartRate });
          }
        })
      );
      this.nativeListeners.push(
        await AntPlusSensors.addListener('csc', data => {
          const payload: { cadence?: number; speed?: number } = {};
          if (typeof data.cadence === 'number') payload.cadence = data.cadence;
          if (typeof data.speed === 'number') payload.speed = data.speed;
          if (Object.keys(payload).length) this.notify(payload);
        })
      );
      this.nativeListeners.push(
        await AntPlusSensors.addListener('power', data => {
          if (typeof data.power === 'number') {
            this.notify({ power: data.power });
          }
        })
      );
      this.nativeListeners.push(
        await AntPlusSensors.addListener('connection', data => {
          const profile = data.profile as 'hrm' | 'csc' | 'power';
          const connected = Boolean(data.connected);
          const deviceName =
            typeof data.deviceName === 'string' ? data.deviceName : undefined;
          if (profile === 'hrm') this.hrmConnected = connected;
          if (profile === 'csc') this.cscConnected = connected;
          if (profile === 'power') this.powerConnected = connected;
          this.connectionListeners.forEach(cb =>
            cb({ profile, connected, deviceName })
          );
        })
      );
      this.nativeListeners.push(
        await AntPlusSensors.addListener('log', data => {
          const source = (data.source as AntPacketLog['source']) || 'SYSTEM';
          const msg = typeof data.data === 'string' ? data.data : JSON.stringify(data);
          this.addLog(source, msg);
        })
      );
    } catch (err: unknown) {
      this.wired = false;
      const message = err instanceof Error ? err.message : 'Failed to bind ANT+ listeners';
      this.addLog('SYSTEM', message);
    }
  }

  public async connectHeartRate(): Promise<{
    success: boolean;
    deviceName?: string;
    error?: string;
  }> {
    return this.connectProfile('hrm');
  }

  public async connectCadenceSpeed(): Promise<{
    success: boolean;
    deviceName?: string;
    error?: string;
  }> {
    return this.connectProfile('csc');
  }

  public async connectPowerMeter(): Promise<{
    success: boolean;
    deviceName?: string;
    error?: string;
  }> {
    return this.connectProfile('power');
  }

  private async connectProfile(
    profile: 'hrm' | 'csc' | 'power'
  ): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!this.isSupported()) {
      return {
        success: false,
        error: 'ANT+ requires the Android app build.'
      };
    }
    try {
      await this.ensureWired();
      const avail = await AntPlusSensors.isAvailable();
      if (!avail.available) {
        return {
          success: false,
          error: avail.error || 'ANT+ services not installed'
        };
      }
      const res = await AntPlusSensors.searchAndConnect({ profile });
      if (res.success) {
        if (profile === 'hrm') this.hrmConnected = true;
        if (profile === 'csc') this.cscConnected = true;
        if (profile === 'power') this.powerConnected = true;
      }
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ANT+ connect failed';
      this.addLog('SYSTEM', message);
      return { success: false, error: message };
    }
  }

  public async disconnectHeartRate(): Promise<void> {
    if (!this.isSupported()) return;
    try {
      await AntPlusSensors.disconnect({ profile: 'hrm' });
    } catch {
      /* ignore */
    }
    this.hrmConnected = false;
  }

  public async disconnectCadenceSpeed(): Promise<void> {
    if (!this.isSupported()) return;
    try {
      await AntPlusSensors.disconnect({ profile: 'csc' });
    } catch {
      /* ignore */
    }
    this.cscConnected = false;
  }

  public async disconnectPowerMeter(): Promise<void> {
    if (!this.isSupported()) return;
    try {
      await AntPlusSensors.disconnect({ profile: 'power' });
    } catch {
      /* ignore */
    }
    this.powerConnected = false;
  }

  public async disconnectAll(): Promise<void> {
    if (!this.isSupported()) return;
    try {
      await AntPlusSensors.disconnectAll();
    } catch {
      /* ignore */
    }
    this.hrmConnected = false;
    this.cscConnected = false;
    this.powerConnected = false;
    this.addLog('SYSTEM', 'All ANT+ sensors disconnected.');
  }

  public getConnectionSnapshot() {
    return {
      hrmConnected: this.hrmConnected,
      cscConnected: this.cscConnected,
      powerConnected: this.powerConnected
    };
  }
}

export const antManager = new AntManager();
