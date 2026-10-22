/**
 * Coggan 7-Zone Power Model based on Functional Threshold Power (FTP)
 */

export interface PowerZoneInfo {
  zone: number; // 1 to 7
  name: string;
  minPercent: number;
  maxPercent: number;
  minWatts: number;
  maxWatts: number;
  color: string;
  badgeClass: string;
}

export const POWER_ZONES_CONFIG = [
  { zone: 1, name: 'Active Recovery', minPct: 0, maxPct: 55, color: '#94a3b8', badge: 'bg-slate-500' },
  { zone: 2, name: 'Endurance', minPct: 55, maxPct: 75, color: '#3b82f6', badge: 'bg-blue-500' },
  { zone: 3, name: 'Tempo', minPct: 76, maxPct: 90, color: '#22c55e', badge: 'bg-emerald-500' },
  { zone: 4, name: 'Threshold', minPct: 91, maxPct: 105, color: '#eab308', badge: 'bg-yellow-500' },
  { zone: 5, name: 'VO2 Max', minPct: 106, maxPct: 120, color: '#f97316', badge: 'bg-orange-500' },
  { zone: 6, name: 'Anaerobic', minPct: 121, maxPct: 150, color: '#ef4444', badge: 'bg-red-500' },
  { zone: 7, name: 'Neuromuscular', minPct: 151, maxPct: 999, color: '#a855f7', badge: 'bg-purple-600' }
];

export function getPowerZoneInfo(watts: number | null, ftp: number = 250): PowerZoneInfo | null {
  if (watts === null || isNaN(watts) || watts <= 0) return null;
  const safeFtp = Math.max(50, ftp);
  const ratio = (watts / safeFtp) * 100;

  for (const z of POWER_ZONES_CONFIG) {
    if (ratio <= z.maxPct || z.zone === 7) {
      return {
        zone: z.zone,
        name: `Z${z.zone} ${z.name}`,
        minPercent: z.minPct,
        maxPercent: z.maxPct,
        minWatts: Math.round((z.minPct / 100) * safeFtp),
        maxWatts: z.maxPct === 999 ? 2500 : Math.round((z.maxPct / 100) * safeFtp),
        color: z.color,
        badgeClass: z.badge
      };
    }
  }

  return null;
}

/**
 * Karvonen Heart Rate Reserve (HRR) 5-Zone Model
 * target = rest + % × (max − rest)
 */
export interface HeartRateZoneInfo {
  zone: number; // 1 to 5
  name: string;
  minPercent: number;
  maxPercent: number;
  minBpm: number;
  maxBpm: number;
  color: string;
  badgeClass: string;
}

export const HR_ZONES_CONFIG = [
  { zone: 1, name: 'Recovery', minPct: 50, maxPct: 60, color: '#94a3b8', badge: 'bg-slate-500' },
  { zone: 2, name: 'Endurance', minPct: 60, maxPct: 70, color: '#3b82f6', badge: 'bg-blue-500' },
  { zone: 3, name: 'Tempo', minPct: 70, maxPct: 80, color: '#22c55e', badge: 'bg-emerald-500' },
  { zone: 4, name: 'Threshold', minPct: 80, maxPct: 90, color: '#eab308', badge: 'bg-yellow-500' },
  { zone: 5, name: 'VO2 Max', minPct: 90, maxPct: 100, color: '#ef4444', badge: 'bg-red-500' }
];

export function getHeartRateZoneInfo(
  bpm: number | null,
  maxHr: number = 190,
  restingHr: number = 60
): HeartRateZoneInfo | null {
  if (bpm === null || isNaN(bpm) || bpm <= 0) return null;
  const safeMax = Math.max(100, Math.min(230, maxHr));
  const safeRest = Math.max(30, Math.min(safeMax - 20, restingHr));
  const hrr = safeMax - safeRest;
  if (hrr <= 0) return null;

  const pct = ((bpm - safeRest) / hrr) * 100;

  for (const z of HR_ZONES_CONFIG) {
    if (pct < z.maxPct || z.zone === 5) {
      return {
        zone: z.zone,
        name: `Z${z.zone} ${z.name}`,
        minPercent: z.minPct,
        maxPercent: z.maxPct,
        minBpm: Math.round(safeRest + (z.minPct / 100) * hrr),
        maxBpm: Math.round(safeRest + (z.maxPct / 100) * hrr),
        color: z.color,
        badgeClass: z.badge
      };
    }
  }

  return null;
}
