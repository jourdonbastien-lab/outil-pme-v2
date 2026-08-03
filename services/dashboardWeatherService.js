'use strict';

function weatherConditionLabel(code) {
  const n = Number(code);
  if ([0].includes(n)) return 'Ciel dégagé';
  if ([1, 2, 3].includes(n)) return 'Nuageux';
  if ([45, 48].includes(n)) return 'Brouillard';
  if ([51, 53, 55, 56, 57].includes(n)) return 'Bruine';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(n)) return 'Pluie';
  if ([71, 73, 75, 77, 85, 86].includes(n)) return 'Neige';
  if ([95, 96, 99].includes(n)) return 'Orage';
  return 'Météo variable';
}

function roundWeatherValue(value, decimals = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function createDashboardWeatherService({ fetch, AbortController, setTimeout, clearTimeout }) {
  async function getWeather() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const params = new URLSearchParams({
        latitude: '47.52', longitude: '-1.29', timezone: 'Europe/Paris', forecast_days: '2',
        current: 'temperature_2m,weather_code,wind_speed_10m,precipitation',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max'
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response.ok) return { statusCode: 502, body: { ok: false, error: 'Météo indisponible' } };
      const data = await response.json();
      const current = data.current || {};
      const daily = data.daily || {};
      const dayAt = (index) => ({
        date: daily.time?.[index] || null,
        condition: weatherConditionLabel(daily.weather_code?.[index]),
        temperatureMax: roundWeatherValue(daily.temperature_2m_max?.[index]),
        temperatureMin: roundWeatherValue(daily.temperature_2m_min?.[index]),
        precipitation: roundWeatherValue(daily.precipitation_sum?.[index], 1),
        windMax: roundWeatherValue(daily.wind_speed_10m_max?.[index])
      });
      return { statusCode: 200, body: {
        ok: true, location: 'Riaillé',
        current: {
          temperature: roundWeatherValue(current.temperature_2m),
          condition: weatherConditionLabel(current.weather_code),
          precipitation: roundWeatherValue(current.precipitation, 1),
          wind: roundWeatherValue(current.wind_speed_10m)
        },
        today: dayAt(0), tomorrow: dayAt(1)
      } };
    } catch (error) {
      return { statusCode: 503, body: { ok: false, error: 'Météo indisponible' } };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { getWeather };
}

module.exports = { createDashboardWeatherService, weatherConditionLabel, roundWeatherValue };
