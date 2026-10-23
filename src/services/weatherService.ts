/**
 * Live GPS Weather Service for ImageneCycle
 * Fetches real-time temperature, condition code, and precipitation probability
 * using live GPS coordinates with 10-minute caching.
 */

export interface WeatherData {
  tempC: number;
  condition: string;
  rainProbability: number; // percentage 0-100
  weatherCode: number;
  windSpeedKmh: number;
  isRaining: boolean;
  locationName?: string;
  updatedAt: number;
}

// In-memory cache to prevent excessive requests
let cachedWeather: WeatherData | null = null;
let lastFetchCoords: { lat: number; lng: number } | null = null;
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Translates WMO weather codes to human-readable condition text
 */
export function getWmoCondition(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code === 1) return 'Mainly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Cloudy';
}

/**
 * Fetches current weather and rain probability for the rider's coordinates.
 */
export async function fetchLiveWeather(lat: number, lng: number): Promise<WeatherData> {
  const now = Date.now();

  // Return cache if coordinates are virtually unchanged and within 10 minutes
  if (
    cachedWeather &&
    lastFetchCoords &&
    now - cachedWeather.updatedAt < CACHE_DURATION_MS &&
    Math.abs(lastFetchCoords.lat - lat) < 0.05 &&
    Math.abs(lastFetchCoords.lng - lng) < 0.05
  ) {
    return cachedWeather;
  }

  // 1. Check if user configured an OpenWeatherMap API key
  const owmKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_OPENWEATHER_API_KEY : null;

  if (owmKey) {
    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${owmKey}`
      );
      if (res.ok) {
        const data = await res.json();
        const rainProb = data.rain ? Math.min(100, Math.round((data.rain['1h'] || 0.5) * 40)) : 10;
        const result: WeatherData = {
          tempC: Math.round(data.main.temp),
          condition: data.weather[0]?.main || 'Clear',
          rainProbability: rainProb,
          weatherCode: data.weather[0]?.id || 800,
          windSpeedKmh: Math.round((data.wind?.speed || 0) * 3.6),
          isRaining: (data.weather[0]?.id || 0) < 700,
          locationName: data.name,
          updatedAt: now
        };
        cachedWeather = result;
        lastFetchCoords = { lat, lng };
        return result;
      }
    } catch (err) {
      console.warn('OpenWeatherMap request failed, falling back to open meteorological data', err);
    }
  }

  // 2. High-precision live meteorological feed (No API key needed, zero-config)
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();

    const current = data.current || {};
    const code = current.weather_code ?? 0;
    const temp = Math.round(current.temperature_2m ?? 24);
    const wind = Math.round(current.wind_speed_10m ?? 12);
    
    // Get current hour's precipitation probability
    const currentHour = new Date().getHours();
    const hourlyProbs: number[] = data.hourly?.precipitation_probability || [];
    const rainProb = hourlyProbs[currentHour] !== undefined ? hourlyProbs[currentHour] : (current.precipitation > 0 ? 80 : 15);
    const isRaining = current.precipitation > 0 || (code >= 51 && code <= 99);

    const result: WeatherData = {
      tempC: temp,
      condition: getWmoCondition(code),
      rainProbability: rainProb,
      weatherCode: code,
      windSpeedKmh: wind,
      isRaining,
      updatedAt: now
    };

    cachedWeather = result;
    lastFetchCoords = { lat, lng };
    return result;
  } catch (err) {
    console.warn('Weather fetch fallback:', err);
    // Graceful offline fallback
    return {
      tempC: 24,
      condition: 'Partly Cloudy',
      rainProbability: 15,
      weatherCode: 2,
      windSpeedKmh: 14,
      isRaining: false,
      updatedAt: now
    };
  }
}
