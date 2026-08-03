'use strict';

function createDashboardWeatherController({ weatherService }) {
  if (!weatherService || typeof weatherService.getWeather !== 'function') throw new Error('weatherService.getWeather est requis');
  async function getWeather(req, res) {
    const result = await weatherService.getWeather();
    if (result.statusCode !== 200) return res.status(result.statusCode).json(result.body);
    return res.json(result.body);
  }
  return { getWeather };
}

module.exports = { createDashboardWeatherController };
