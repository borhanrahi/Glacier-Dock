/**
 * Remote feed helpers used by catalog widgets.
 *
 * All requests go through the Rust `fetch_text` command (WinHTTP), so TLS,
 * proxies and the OS trust store apply. Nothing is sent anywhere except the
 * URL the user configured.
 */

import glacier from "./bridge";

export interface WeatherNow {
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  code: number;
  isDay: boolean;
  precipitationMm: number;
  pressureHpa: number;
  uvIndex: number;
}

export interface WeatherDay {
  date: string;
  minC: number;
  maxC: number;
  code: number;
  precipitationMm: number;
}

export interface AirQuality {
  usAqi: number;
  pm25: number;
  pm10: number;
}

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function getJson<T>(url: string): Promise<T> {
  const text = await glacier.system.fetchText(url);
  return JSON.parse(text) as T;
}

export async function weatherNow(lat: number, lon: number): Promise<WeatherNow> {
  return cached(`now:${lat},${lon}`, async () => {
    const data = await getJson<{
      current?: Record<string, number | string>;
    }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m," +
        "weather_code,is_day,precipitation,pressure_msl,uv_index&wind_speed_unit=kmh",
    );
    const current = data.current ?? {};
    return {
      temperatureC: Number(current.temperature_2m ?? 0),
      feelsLikeC: Number(current.apparent_temperature ?? 0),
      humidity: Number(current.relative_humidity_2m ?? 0),
      windKph: Number(current.wind_speed_10m ?? 0),
      code: Number(current.weather_code ?? 0),
      isDay: Number(current.is_day ?? 1) === 1,
      precipitationMm: Number(current.precipitation ?? 0),
      pressureHpa: Number(current.pressure_msl ?? 0),
      uvIndex: Number(current.uv_index ?? 0),
    };
  });
}

export async function weatherDaily(lat: number, lon: number): Promise<WeatherDay[]> {
  return cached(`daily:${lat},${lon}`, async () => {
    const data = await getJson<{
      daily?: {
        time?: string[];
        temperature_2m_min?: number[];
        temperature_2m_max?: number[];
        weather_code?: number[];
        precipitation_sum?: number[];
      };
    }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        "&daily=temperature_2m_min,temperature_2m_max,weather_code,precipitation_sum" +
        "&forecast_days=5&timezone=auto",
    );
    const daily = data.daily ?? {};
    return (daily.time ?? []).map((date, index) => ({
      date,
      minC: daily.temperature_2m_min?.[index] ?? 0,
      maxC: daily.temperature_2m_max?.[index] ?? 0,
      code: daily.weather_code?.[index] ?? 0,
      precipitationMm: daily.precipitation_sum?.[index] ?? 0,
    }));
  });
}

export async function airQuality(lat: number, lon: number): Promise<AirQuality> {
  return cached(`aq:${lat},${lon}`, async () => {
    const data = await getJson<{
      current?: Record<string, number>;
    }>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        "&current=us_aqi,pm2_5,pm10",
    );
    const current = data.current ?? {};
    return {
      usAqi: Number(current.us_aqi ?? 0),
      pm25: Number(current.pm2_5 ?? 0),
      pm10: Number(current.pm10 ?? 0),
    };
  });
}

/** Weather code → short label (WMO 4677 subset used by open-meteo). */
export function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Mostly clear";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorm";
}

export function weatherGlyph(code: number, isDay = true): string {
  if (code === 0) return isDay ? "☀" : "☾";
  if (code <= 2) return isDay ? "⛅" : "☁";
  if (code === 3) return "☁";
  if (code <= 48) return "🌫";
  if (code <= 57) return "🌦";
  if (code <= 67) return "🌧";
  if (code <= 77) return "❄";
  if (code <= 82) return "🌧";
  if (code <= 86) return "🌨";
  return "⛈";
}

export async function fxRates(base = "USD"): Promise<Record<string, number>> {
  return cached(`fx:${base}`, async () => {
    const data = await getJson<{ rates?: Record<string, number> }>(
      `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`,
    );
    return data.rates ?? {};
  });
}

export interface CryptoQuote {
  id: string;
  symbol: string;
  price: number;
  change24h: number;
}

export async function cryptoQuotes(
  ids: string[] = ["bitcoin", "ethereum"],
  vs = "usd",
): Promise<CryptoQuote[]> {
  return cached(`crypto:${ids.join(",")}:${vs}`, async () => {
    const data = await getJson<
      Array<{
        id: string;
        symbol: string;
        current_price: number;
        price_change_percentage_24h: number | null;
      }>
    >(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs}` +
        `&ids=${ids.join(",")}&price_change_percentage=24h`,
    );
    return data.map((row) => ({
      id: row.id,
      symbol: row.symbol.toUpperCase(),
      price: row.current_price,
      change24h: row.price_change_percentage_24h ?? 0,
    }));
  });
}

export interface GitHubActivity {
  login: string;
  publicRepos: number;
  followers: number;
  latest: Array<{ repo: string; type: string; at: string }>;
}

export async function githubActivity(user: string): Promise<GitHubActivity> {
  return cached(`gh:${user}`, async () => {
    const [profile, events] = await Promise.all([
      getJson<{ login: string; public_repos: number; followers: number }>(
        `https://api.github.com/users/${encodeURIComponent(user)}`,
      ),
      getJson<Array<{ type: string; repo: { name: string }; created_at: string }>>(
        `https://api.github.com/users/${encodeURIComponent(user)}/events/public?per_page=5`,
      ).catch(() => []),
    ]);
    return {
      login: profile.login,
      publicRepos: profile.public_repos,
      followers: profile.followers,
      latest: events.map((event) => ({
        repo: event.repo?.name ?? "",
        type: event.type?.replace("Event", "") ?? "",
        at: event.created_at ?? "",
      })),
    };
  });
}

export async function publicIp(): Promise<string> {
  return cached("ip", async () => (await glacier.system.fetchText("https://api.ipify.org")).trim());
}

export interface CalendarEvent {
  summary: string;
  start: Date;
  location: string;
}

/** Minimal iCalendar reader: enough for DTSTART/SUMMARY/LOCATION feeds. */
export function parseIcs(text: string, limit = 5): CalendarEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const events: CalendarEvent[] = [];

  for (const block of blocks) {
    const line = (name: string) => {
      const match = block.match(new RegExp(`^${name}[^:]*:(.*)$`, "m"));
      return match ? match[1].trim() : "";
    };
    const start = parseIcsDate(line("DTSTART"));
    if (!start) continue;
    events.push({ summary: line("SUMMARY") || "Untitled event", start, location: line("LOCATION") });
    if (events.length >= limit) break;
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function parseIcsDate(value: string): Date | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", zulu] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${zulu ? "Z" : ""}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
