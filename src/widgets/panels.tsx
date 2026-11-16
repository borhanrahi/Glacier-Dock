/**
 * Shared panels for widgets that read native APIs or remote feeds. Each panel
 * owns its own configuration (stored per widget id) and shows an explicit
 * setup state instead of empty placeholder numbers.
 */

import { useEffect, useState } from "react";
import { Bars, Field, MiniButton, Ring, Row, Unavailable, WidgetFrame, bps, bytes } from "./kit";
import { useAsync, useWidgetStorage } from "../sdk/hooks";
import glacier, { type NetworkInterface } from "../sdk/bridge";
import {
  airQuality,
  cryptoQuotes,
  githubActivity,
  parseIcs,
  publicIp,
  weatherDaily,
  weatherGlyph,
  weatherLabel,
  weatherNow,
} from "../sdk/feeds";

function SetupCoords({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children?: React.ReactNode;
}) {
  const [lat, setLat] = useWidgetStorage<string>(id, "latitude", "");
  const [lon, setLon] = useWidgetStorage<string>(id, "longitude", "");
  return (
    <WidgetFrame title={label}>
      <div className="flex h-full flex-col justify-center gap-1.5 text-[11px]">
        <span className="text-[10px] leading-snug opacity-60">
          Set your coordinates once — stored locally, only sent to the weather provider.
        </span>
        <Field value={lat} onChange={setLat} placeholder="latitude e.g. 51.5072" />
        <Field value={lon} onChange={setLon} placeholder="longitude e.g. -0.1276" />
        <div className="opacity-40">{children}</div>
      </div>
    </WidgetFrame>
  );
}

function useCoords(id: string) {
  const [lat, setLat] = useWidgetStorage<string>(id, "latitude", "");
  const [lon, setLon] = useWidgetStorage<string>(id, "longitude", "");
  const latitude = Number(lat);
  const longitude = Number(lon);
  const ready =
    lat.trim() !== "" &&
    lon.trim() !== "" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  return { ready, latitude, longitude, lat, lon, setLat, setLon };
}

/* ------------------------------------------------------------------ weather */

export function WeatherNowPanel({ id }: { id: string }) {
  const coords = useCoords(id);
  const { data, error } = useAsync(
    () => (coords.ready ? weatherNow(coords.latitude, coords.longitude) : Promise.resolve(null)),
    [coords.ready, coords.latitude, coords.longitude],
    300_000,
  );

  if (!coords.ready) return <SetupCoords id={id} label="Weather" />;

  return (
    <WidgetFrame title="Weather" hint={data ? weatherLabel(data.code) : "loading"}>
      {data ? (
        <div className="flex h-full items-center justify-between gap-2">
          <div>
            <div className="text-3xl font-semibold tabular-nums">
              {Math.round(data.temperatureC)}°
            </div>
            <div className="text-[10px] opacity-60">feels {Math.round(data.feelsLikeC)}°</div>
          </div>
          <div className="text-right">
            <div className="text-3xl">{weatherGlyph(data.code, data.isDay)}</div>
            <div className="text-[9px] uppercase tracking-wider opacity-60">
              {coords.latitude.toFixed(1)}, {coords.longitude.toFixed(1)}
            </div>
          </div>
        </div>
      ) : (
        <Row label="Status" value={error ?? "fetching…"} />
      )}
    </WidgetFrame>
  );
}

export function WeatherForecastPanel({ id }: { id: string }) {
  const coords = useCoords(id);
  const { data, error } = useAsync(
    () => (coords.ready ? weatherDaily(coords.latitude, coords.longitude) : Promise.resolve([])),
    [coords.ready, coords.latitude, coords.longitude],
    900_000,
  );

  if (!coords.ready) return <SetupCoords id={id} label="Forecast" />;

  return (
    <WidgetFrame title="Forecast" hint="5 days">
      {data && data.length > 0 ? (
        <div className="space-y-1 text-[11px]">
          {data.map((day) => (
            <div key={day.date} className="flex items-center gap-2">
              <span className="w-8 text-[10px] opacity-60">
                {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span className="w-5 text-center">{weatherGlyph(day.code)}</span>
              <span className="w-8 text-right tabular-nums">{Math.round(day.maxC)}°</span>
              <span className="w-8 text-right tabular-nums opacity-50">{Math.round(day.minC)}°</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[var(--glacier-accent)]"
                  style={{ width: `${Math.min(100, day.precipitationMm * 20)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Row label="Status" value={error ?? "fetching…"} />
      )}
    </WidgetFrame>
  );
}

export function AirQualityPanel({ id }: { id: string }) {
  const coords = useCoords(id);
  const { data, error } = useAsync(
    () => (coords.ready ? airQuality(coords.latitude, coords.longitude) : Promise.resolve(null)),
    [coords.ready, coords.latitude, coords.longitude],
    900_000,
  );

  if (!coords.ready) return <SetupCoords id={id} label="Air quality" />;

  const tone = (aqi: number) =>
    aqi <= 50 ? "#34D399" : aqi <= 100 ? "#FACC15" : aqi <= 150 ? "#FB923C" : "#F87171";

  return (
    <WidgetFrame title="Air quality">
      {data ? (
        <div className="flex h-full flex-col items-center justify-center gap-1">
          <Ring value={Math.min(100, data.usAqi / 3)} center={String(data.usAqi)} label="US AQI" color={tone(data.usAqi)} />
          <span className="text-[10px] opacity-60">
            PM2.5 {data.pm25.toFixed(1)} · PM10 {data.pm10.toFixed(1)}
          </span>
        </div>
      ) : (
        <Row label="Status" value={error ?? "fetching…"} />
      )}
    </WidgetFrame>
  );
}

export function WeatherMetricPanel({ id, metric }: { id: string; metric: "wind" | "humidity" | "uv" | "pressure" | "rain" }) {
  const coords = useCoords(id);
  const { data, error } = useAsync(
    () => (coords.ready ? weatherNow(coords.latitude, coords.longitude) : Promise.resolve(null)),
    [coords.ready, coords.latitude, coords.longitude],
    300_000,
  );

  const titles: Record<string, string> = {
    wind: "Wind",
    humidity: "Humidity",
    uv: "UV index",
    pressure: "Pressure",
    rain: "Precipitation",
  };

  if (!coords.ready) return <SetupCoords id={id} label={titles[metric]} />;

  const value = data
    ? metric === "wind"
      ? `${Math.round(data.windKph)} km/h`
      : metric === "humidity"
        ? `${Math.round(data.humidity)}%`
        : metric === "uv"
          ? data.uvIndex.toFixed(1)
          : metric === "pressure"
            ? `${Math.round(data.pressureHpa)} hPa`
            : `${data.precipitationMm.toFixed(1)} mm`
    : "—";

  return (
    <WidgetFrame title={titles[metric]} hint={data ? weatherLabel(data.code) : undefined}>
      <div className="grid h-full place-items-center">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {error && <span className="text-[9px] text-amber-300">{error}</span>}
      </div>
    </WidgetFrame>
  );
}

/* ------------------------------------------------------------------- finance */

export function CryptoPanel({ id }: { id: string }) {
  const [coins, setCoins] = useWidgetStorage<string>(id, "coins", "bitcoin,ethereum");
  const { data, error } = useAsync(() => cryptoQuotes(coins.split(","), "usd"), [coins], 120_000);

  return (
    <WidgetFrame title="Crypto" hint="USD">
      <div className="flex h-full flex-col gap-1">
        <div className="flex-1 space-y-1 overflow-y-auto text-[11px]">
          {(data ?? []).map((quote) => (
            <div key={quote.id} className="flex items-baseline justify-between">
              <span className="font-medium">{quote.symbol}</span>
              <span className="tabular-nums">
                ${quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span
                className="w-12 text-right text-[10px] tabular-nums"
                style={{ color: quote.change24h >= 0 ? "#34D399" : "#F87171" }}
              >
                {quote.change24h >= 0 ? "▲" : "▼"} {Math.abs(quote.change24h).toFixed(1)}%
              </span>
            </div>
          ))}
          {!data && <span className="text-[10px] opacity-50">{error ?? "fetching…"}</span>}
        </div>
        <Field value={coins} onChange={setCoins} placeholder="coingecko ids" />
      </div>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------- connectivity */

export function PortsPanel({ limit = 8 }: { limit?: number }) {
  const [ports, setPorts] = useState<Array<{ port: number; process: string; pid: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const read = () => {
      glacier.system
        .listeningPorts()
        .then((next) => alive && setPorts(next.slice(0, limit)))
        .catch((err: unknown) => alive && setError(String(err)));
    };
    read();
    const timer = window.setInterval(read, 5_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [limit]);

  return (
    <WidgetFrame title="Listening ports" live>
      <div className="space-y-0.5 overflow-y-auto text-[10px]">
        {ports.map((entry) => (
          <div key={`${entry.pid}-${entry.port}`} className="flex items-center justify-between gap-2">
            <span className="font-mono tabular-nums">{entry.port}</span>
            <span className="flex-1 truncate opacity-60">{entry.process || `#${entry.pid}`}</span>
            <MiniButton onClick={() => glacier.system.taskManager().catch(() => {})}>manage</MiniButton>
          </div>
        ))}
        {ports.length === 0 && <span className="opacity-50">{error ?? "none"}</span>}
      </div>
    </WidgetFrame>
  );
}

export function InterfacesPanel({ wifiOnly }: { wifiOnly?: boolean }) {
  const { data, error } = useAsync(() => glacier.system.networkInterfaces(), [], 5_000);
  const list = (data ?? []).filter(
    (entry: NetworkInterface) => entry.up && !entry.loopback && (!wifiOnly || entry.kind === "wifi"),
  );

  return (
    <WidgetFrame title={wifiOnly ? "Wi-Fi" : "Adapters"} live>
      {list.length > 0 ? (
        <div className="space-y-1.5 overflow-y-auto text-[10px]">
          {list.map((entry: NetworkInterface) => (
            <div key={entry.alias} className="rounded-md bg-white/5 px-2 py-1">
              <div className="flex items-center justify-between">
                <span className="truncate font-medium">{entry.alias || entry.description}</span>
                <span className="shrink-0 text-[9px] uppercase opacity-50">{entry.kind}</span>
              </div>
              <Row label="link" value={entry.speedBps ? bps(entry.speedBps) : "—"} />
              <Row label="rx / tx" value={`${bytes(entry.rxBytes)} / ${bytes(entry.txBytes)}`} mono />
            </div>
          ))}
        </div>
      ) : (
        <Unavailable what={wifiOnly ? "Wi-Fi" : "Network adapters"} requires={error ?? "No active adapter reported by the OS."} />
      )}
    </WidgetFrame>
  );
}

export function PingPanel({ id, quality }: { id: string; quality?: boolean }) {
  const [host, setHost] = useWidgetStorage<string>(id, "host", "1.1.1.1");
  const [samples, setSamples] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const probe = () => {
      glacier.system
        .ping(host, 443, 2_000)
        .then((ms) => {
          if (!alive) return;
          setSamples((previous) => [...previous, ms].slice(-24));
          setError(null);
        })
        .catch((err: unknown) => alive && setError(String(err)));
    };
    probe();
    const timer = window.setInterval(probe, quality ? 2_000 : 5_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [host, quality]);

  const latest = samples.at(-1);
  const average = samples.length
    ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
    : null;
  const jitter =
    samples.length > 1
      ? Math.round(Math.sqrt(samples.reduce((sum, value) => sum + (value - (average ?? 0)) ** 2, 0) / samples.length))
      : 0;

  return (
    <WidgetFrame title={quality ? "Connection quality" : "Latency"} hint={host}>
      <div className="flex h-full flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{latest ?? "—"}</span>
          <span className="text-[10px] opacity-60">ms</span>
          {average !== null && <span className="ml-auto text-[10px] opacity-60">avg {average} · jitter {jitter}</span>}
        </div>
        {quality ? (
          <Bars
            items={[
              { label: "latency", value: latest ?? 0, unit: " ms", color: (latest ?? 0) < 60 ? "#34D399" : (latest ?? 0) < 140 ? "#FACC15" : "#F87171" },
              { label: "jitter", value: jitter, unit: " ms" },
            ]}
            max={200}
          />
        ) : (
          <div className="h-10">
            <svg viewBox="0 0 120 40" className="h-full w-full" preserveAspectRatio="none">
              <polyline
                points={samples
                  .map((value, index) => `${(index / Math.max(1, samples.length - 1)) * 120},${40 - Math.min(38, value / 4)}`)
                  .join(" ")}
                fill="none"
                stroke="var(--glacier-accent)"
                strokeWidth="1.5"
              />
            </svg>
          </div>
        )}
        <Field value={host} onChange={setHost} placeholder="host" mono />
        {error && <span className="truncate text-[9px] text-amber-300">{error}</span>}
      </div>
    </WidgetFrame>
  );
}

export function DnsPanel({ id }: { id: string }) {
  const [host, setHost] = useWidgetStorage<string>(id, "host", "github.com");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    glacier.system
      .resolve(host)
      .then((next) => alive && (setAddresses(next), setError(null)))
      .catch((err: unknown) => alive && setError(String(err)));
    return () => {
      alive = false;
    };
  }, [host]);

  return (
    <WidgetFrame title="DNS lookup">
      <div className="flex h-full flex-col gap-1.5">
        <Field value={host} onChange={setHost} placeholder="domain" mono />
        <div className="flex-1 space-y-0.5 overflow-y-auto font-mono text-[10px]">
          {addresses.map((address) => (
            <div key={address}>{address}</div>
          ))}
          {addresses.length === 0 && <span className="opacity-50">{error ?? "no records"}</span>}
        </div>
      </div>
    </WidgetFrame>
  );
}

export function PublicIpPanel() {
  const { data, error } = useAsync(() => publicIp(), [], 600_000);
  return (
    <WidgetFrame title="Public IP">
      <div className="flex h-full flex-col justify-center gap-1">
        <span className="truncate font-mono text-sm">{data ?? "—"}</span>
        <span className="text-[9px] opacity-50">{error ?? "via api.ipify.org"}</span>
      </div>
    </WidgetFrame>
  );
}

/* ------------------------------------------------------------ dev / comms */

export function GithubPanel({ id }: { id: string }) {
  const [user, setUser] = useWidgetStorage<string>(id, "user", "");
  const { data, error } = useAsync(
    () => (user.trim() ? githubActivity(user.trim()) : Promise.resolve(null)),
    [user],
    600_000,
  );

  return (
    <WidgetFrame title="GitHub activity" hint={user || "set user"}>
      <div className="flex h-full flex-col gap-1 text-[10px]">
        {data ? (
          <>
            <div className="flex justify-between opacity-70">
              <span>{data.publicRepos} repos</span>
              <span>{data.followers} followers</span>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto">
              {data.latest.map((event, index) => (
                <div key={`${event.repo}-${index}`} className="truncate">
                  <span className="opacity-50">{event.type}</span> {event.repo}
                </div>
              ))}
            </div>
          </>
        ) : (
          <span className="opacity-50">{error ?? "Add a GitHub username"}</span>
        )}
        <Field value={user} onChange={setUser} placeholder="octocat" />
      </div>
    </WidgetFrame>
  );
}

export function MeetingPanel({ id }: { id: string }) {
  const [url, setUrl] = useWidgetStorage<string>(id, "icsUrl", "");
  const [events, setEvents] = useState<Array<{ summary: string; start: Date; location: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url.trim()) return;
    let alive = true;
    glacier.system
      .fetchText(url)
      .then((text) => alive && (setEvents(parseIcs(text)), setError(null)))
      .catch((err: unknown) => alive && setError(String(err)));
    return () => {
      alive = false;
    };
  }, [url]);

  const next = events.find((event) => event.start.getTime() > Date.now());

  return (
    <WidgetFrame title="Next meeting" hint={url ? "calendar feed" : "no feed"}>
      <div className="flex h-full flex-col justify-between gap-1.5 text-[11px]">
        {next ? (
          <>
            <div className="font-medium leading-tight">{next.summary}</div>
            <div className="text-[10px] opacity-60">
              {next.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
              {Math.max(0, Math.round((next.start.getTime() - Date.now()) / 60_000))} min
            </div>
          </>
        ) : (
          <span className="opacity-50 text-[10px]">
            {error ?? (url ? "No upcoming events" : "Paste a private .ics feed URL")}
          </span>
        )}
        <Field value={url} onChange={setUrl} placeholder="https://…/calendar.ics" />
      </div>
    </WidgetFrame>
  );
}

export function ProxyStatusPanel() {
  return (
    <WidgetFrame title="Proxy">
      <Unavailable
        what="Proxy status"
        requires="Reads WinINet/registry proxy settings. Not included in this build — configure proxies through Windows Settings."
      />
    </WidgetFrame>
  );
}
