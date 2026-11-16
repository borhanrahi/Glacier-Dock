/**
 * Sunrise/sunset math for the Auto Day/Night Solar Schedule.
 * NOAA's simplified solar position algorithm — accurate to a couple of minutes,
 * which is far more than a theme transition needs.
 */

const DEG = Math.PI / 180;

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start;
  return Math.floor(diff / 86_400_000);
}

function minutesToDate(base: Date, utcMinutes: number | null): Date | null {
  if (utcMinutes === null || Number.isNaN(utcMinutes)) return null;
  const dayStart = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  return new Date(dayStart + utcMinutes * 60_000);
}

/** Sunrise/sunset in local time, or `null` for polar day/night. */
export function solarTimes(
  latitude: number,
  longitude: number,
  date = new Date(),
): { sunrise: Date | null; sunset: Date | null } {
  const n = dayOfYear(date);
  // Fractional year (radians)
  const gamma = ((2 * Math.PI) / 365) * (n - 1 + 0.5);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const lat = latitude * DEG;
  const cosHa =
    Math.cos(90.833 * DEG) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  if (cosHa > 1 || cosHa < -1) {
    return { sunrise: null, sunset: null };
  }
  const ha = Math.acos(cosHa) / DEG;

  const sunriseMinutes = 720 - 4 * (longitude + ha) - eqTime;
  const sunsetMinutes = 720 - 4 * (longitude - ha) - eqTime;

  return {
    sunrise: minutesToDate(date, sunriseMinutes),
    sunset: minutesToDate(date, sunsetMinutes),
  };
}

export function isDaytime(latitude: number, longitude: number, now = new Date()): boolean {
  const { sunrise, sunset } = solarTimes(latitude, longitude, now);
  if (!sunrise || !sunset) {
    // Polar day/night: fall back to clock time.
    const hour = now.getHours();
    return hour >= 7 && hour < 19;
  }
  return now >= sunrise && now < sunset;
}
