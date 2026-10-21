import React, { useEffect, useState } from 'react';
import { Sun, Cloud, CloudSun, CloudRain, CloudLightning, CloudDrizzle, Wind } from 'lucide-react';
import { fetchLiveWeather, WeatherData } from '../services/weatherService';

interface WeatherBadgeProps {
  lat?: number;
  lng?: number;
  isDarkMode?: boolean;
}

export const WeatherBadge: React.FC<WeatherBadgeProps> = ({
  lat,
  lng,
  isDarkMode = false
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  useEffect(() => {
    if (!lat || !lng) return;

    let isMounted = true;
    setLoading(true);

    fetchLiveWeather(lat, lng)
      .then(data => {
        if (isMounted) {
          setWeather(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    // Refresh every 10 minutes
    const interval = setInterval(() => {
      if (lat && lng) {
        fetchLiveWeather(lat, lng).then(data => {
          if (isMounted) setWeather(data);
        });
      }
    }, 10 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [lat, lng]);

  if (loading && !weather) {
    return (
      <div className={`px-2 py-0.5 rounded-md text-[10px] font-sports flex items-center gap-1.5 ${
        isDarkMode ? 'bg-zinc-900 text-zinc-400' : 'bg-zinc-100 text-zinc-600'
      }`}>
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        <span>Weather...</span>
      </div>
    );
  }

  if (!weather) return null;

  // Icon mapping
  const getWeatherIcon = (code: number, isRaining: boolean) => {
    if (code >= 95) return <CloudLightning className="w-3 h-3 text-amber-400 shrink-0" />;
    if (isRaining || code >= 61) return <CloudRain className="w-3 h-3 text-cyan-400 shrink-0" />;
    if (code >= 51) return <CloudDrizzle className="w-3 h-3 text-cyan-300 shrink-0" />;
    if (code === 0 || code === 1) return <Sun className="w-3 h-3 text-amber-500 shrink-0" />;
    if (code === 2) return <CloudSun className="w-3 h-3 text-amber-400 shrink-0" />;
    return <Cloud className="w-3 h-3 text-zinc-400 shrink-0" />;
  };

  // Color coding for rain probability
  const rainProbColor =
    weather.rainProbability >= 50
      ? 'text-cyan-400 font-bold'
      : weather.rainProbability >= 25
      ? 'text-amber-400'
      : 'text-zinc-400';

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`px-2 py-0.5 rounded-md text-[10px] font-sports font-semibold flex items-center gap-1.5 transition-colors border ${
          isDarkMode
            ? 'bg-zinc-900/90 border-zinc-800 text-zinc-200 hover:border-zinc-700'
            : 'bg-zinc-100 border-zinc-200 text-zinc-800 hover:border-zinc-300'
        }`}
        title={`Weather: ${weather.tempC}°C, ${weather.condition}, ${weather.rainProbability}% Rain chance`}
      >
        {getWeatherIcon(weather.weatherCode, weather.isRaining)}
        <span className="font-digital font-bold text-xs">{weather.tempC}°</span>
        <span className="text-zinc-400">·</span>
        <span className={rainProbColor}>{weather.rainProbability}% rain</span>
      </button>

      {/* Mini Details Popover */}
      {showDetails && (
        <div 
          className="absolute top-full mt-1.5 left-0 z-[600] w-48 bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-xs text-white shadow-xl animate-in fade-in duration-150"
          onClick={() => setShowDetails(false)}
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
            <span className="font-sports font-bold text-[11px] text-zinc-300 uppercase">
              {weather.condition}
            </span>
            <span className="font-digital font-bold text-sm text-blue-400">{weather.tempC}°C</span>
          </div>
          <div className="mt-2 space-y-1 text-[10px] text-zinc-400 font-sports">
            <div className="flex items-center justify-between">
              <span>Rain Probability:</span>
              <span className={`font-bold ${rainProbColor}`}>{weather.rainProbability}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Wind Speed:</span>
              <span className="text-zinc-200">{weather.windSpeedKmh} km/h</span>
            </div>
            <div className="flex items-center justify-between text-[9px] text-zinc-500 pt-1 border-t border-zinc-800">
              <span>GPS Weather</span>
              <span>Tap to dismiss</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
