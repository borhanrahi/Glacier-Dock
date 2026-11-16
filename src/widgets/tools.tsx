/**
 * Shared tool implementations behind the developer, security and utility
 * widgets. Each tool is a complete, self-contained function: the catalog files
 * only pick a variant and hand it their widget id for persistence.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Field, MiniButton, Row, WidgetFrame } from "./kit";
import { useWidgetStorage } from "../sdk/hooks";
import { fxRates } from "../sdk/feeds";
import glacier from "../sdk/bridge";

function Output({ value, mono = true }: { value: string; mono?: boolean }) {
  return (
    <pre
      className={`max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/25 p-2 text-[10px] leading-snug ${
        mono ? "font-mono" : ""
      }`}
    >
      {value || " "}
    </pre>
  );
}

/* ----------------------------------------------------------- text / crypto */

export function TextTool({
  id,
  mode,
}: {
  id: string;
  mode: "base64" | "json" | "jwt" | "hash" | "uuid";
}) {
  const [input, setInput] = useWidgetStorage<string>(id, "input", "");
  const [output, setOutput] = useState("");
  const [hashAlgo, setHashAlgo] = useState("SHA-256");

  const utf8ToBase64 = (text: string) => {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary);
  };

  const base64ToUtf8 = (text: string) => {
    const binary = atob(text.trim());
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  };

  const run = async (action: string) => {
    try {
      if (mode === "base64") {
        setOutput(action === "encode" ? utf8ToBase64(input) : base64ToUtf8(input));
      } else if (mode === "json") {
        setOutput(
          action === "format"
            ? JSON.stringify(JSON.parse(input), null, 2)
            : JSON.stringify(JSON.parse(input)),
        );
      } else if (mode === "jwt") {
        const parts = input.trim().split(".");
        if (parts.length < 2) throw new Error("Not a JWT (expected header.payload.signature)");
        const decode = (part: string) =>
          JSON.parse(base64ToUtf8(part.replace(/-/g, "+").replace(/_/g, "/")));
        setOutput(JSON.stringify({ header: decode(parts[0]), payload: decode(parts[1]) }, null, 2));
      } else if (mode === "hash") {
        const digest = await crypto.subtle.digest(hashAlgo, new TextEncoder().encode(input));
        setOutput(
          Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join(""),
        );
      }
    } catch (error) {
      setOutput(error instanceof Error ? error.message : String(error));
    }
  };

  const generateUuid = () => setOutput(crypto.randomUUID());

  const title = { base64: "Base64", json: "JSON", jwt: "JWT decoder", hash: "Hash", uuid: "UUID" }[mode];

  return (
    <WidgetFrame title={title}>
      <div className="flex h-full flex-col gap-1.5">
        <textarea
          value={input}
          rows={3}
          spellCheck={false}
          placeholder={mode === "uuid" ? "Press Generate" : "Paste text…"}
          onChange={(event) => setInput(event.target.value)}
          className="w-full resize-none rounded-md border border-[var(--glacier-border)] bg-black/20 p-2 font-mono text-[10px] outline-none focus:border-[var(--glacier-accent)]"
        />
        <div className="flex flex-wrap gap-1">
          {mode === "base64" && (
            <>
              <MiniButton onClick={() => run("encode")}>Encode</MiniButton>
              <MiniButton onClick={() => run("decode")}>Decode</MiniButton>
            </>
          )}
          {mode === "json" && (
            <>
              <MiniButton onClick={() => run("format")}>Format</MiniButton>
              <MiniButton onClick={() => run("minify")}>Minify</MiniButton>
            </>
          )}
          {mode === "jwt" && <MiniButton onClick={() => run("decode")}>Decode</MiniButton>}
          {mode === "hash" && (
            <>
              {["SHA-256", "SHA-1", "SHA-512"].map((algo) => (
                <MiniButton key={algo} active={hashAlgo === algo} onClick={() => setHashAlgo(algo)}>
                  {algo.replace("SHA-", "")}
                </MiniButton>
              ))}
              <MiniButton onClick={() => run("hash")}>Hash</MiniButton>
            </>
          )}
          {mode === "uuid" && <MiniButton onClick={generateUuid}>Generate v4</MiniButton>}
        </div>
        <Output value={output} />
      </div>
    </WidgetFrame>
  );
}

export function RegexTool({ id }: { id: string }) {
  const [pattern, setPattern] = useWidgetStorage<string>(id, "pattern", "\\b\\w+@\\w+\\.\\w+\\b");
  const [text, setText] = useWidgetStorage<string>(id, "text", "hello@glacier.dev and second@example.org");
  const [flags, setFlags] = useWidgetStorage<string>(id, "flags", "gi");

  const result = useMemo(() => {
    try {
      const regex = new RegExp(pattern, flags);
      const matches = Array.from(text.matchAll(regex)).slice(0, 20);
      return { ok: true, matches: matches.map((match) => match[0]) };
    } catch (error) {
      return { ok: false, matches: [error instanceof Error ? error.message : String(error)] };
    }
  }, [pattern, flags, text]);

  return (
    <WidgetFrame title="Regex tester" hint={`${result.matches.length} match`}>
      <div className="flex h-full flex-col gap-1.5">
        <div className="flex gap-1">
          <Field value={pattern} onChange={setPattern} mono placeholder="pattern" />
          <div className="w-12">
            <Field value={flags} onChange={setFlags} mono placeholder="flags" />
          </div>
        </div>
        <textarea
          value={text}
          rows={3}
          onChange={(event) => setText(event.target.value)}
          className="w-full resize-none rounded-md bg-black/20 p-2 font-mono text-[10px] outline-none focus:border-[var(--glacier-accent)]"
        />
        <div className="flex-1 space-y-0.5 overflow-y-auto font-mono text-[10px]">
          {result.matches.map((match, index) => (
            <div key={`${match}-${index}`} className="truncate rounded bg-white/5 px-1.5 py-0.5">
              {match || "∅"}
            </div>
          ))}
          {result.matches.length === 0 && <span className="opacity-50">no matches</span>}
        </div>
      </div>
    </WidgetFrame>
  );
}

export function PasswordTool({ id, variant }: { id: string; variant: "generate" | "strength" }) {
  const [length, setLength] = useWidgetStorage<number>(id, "length", 20);
  const [symbols, setSymbols] = useWidgetStorage<boolean>(id, "symbols", true);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");

  const generate = () => {
    const alphabet =
      "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789" + (symbols ? "!@#$%^&*-_=+" : "");
    const bytes = crypto.getRandomValues(new Uint32Array(length));
    setPassword(
      Array.from(bytes)
        .map((value) => alphabet[value % alphabet.length])
        .join(""),
    );
  };

  useEffect(() => {
    if (variant === "generate") generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length, symbols, variant]);

  if (variant === "strength") {
    const pool =
      (/[a-z]/.test(typed) ? 26 : 0) +
      (/[A-Z]/.test(typed) ? 26 : 0) +
      (/[0-9]/.test(typed) ? 10 : 0) +
      (/[^a-zA-Z0-9]/.test(typed) ? 32 : 0);
    const bits = typed.length > 0 && pool > 0 ? typed.length * Math.log2(pool) : 0;
    const label = bits > 100 ? "Excellent" : bits > 70 ? "Strong" : bits > 45 ? "Fair" : "Weak";
    const color = bits > 70 ? "#34D399" : bits > 45 ? "#FACC15" : "#F87171";
    return (
      <WidgetFrame title="Password strength" hint={`${Math.round(bits)} bits`}>
        <div className="flex h-full flex-col justify-center gap-2">
          <Field value={typed} onChange={setTyped} placeholder="Type a password…" mono />
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full transition-[width]"
              style={{ width: `${Math.min(100, (bits / 128) * 100)}%`, background: color }}
            />
          </div>
          <Row label="Rating" value={<span style={{ color }}>{label}</span>} />
          <Row label="Charset" value={`${pool} symbols`} />
        </div>
      </WidgetFrame>
    );
  }

  return (
    <WidgetFrame title="Password generator" hint={`${length} chars`}>
      <div className="flex h-full flex-col gap-1.5">
        <Output value={password} />
        <div className="flex items-center gap-2 text-[10px]">
          <input
            type="range"
            min={8}
            max={48}
            value={length}
            onChange={(event) => setLength(Number(event.target.value))}
            className="flex-1 accent-[var(--glacier-accent)]"
          />
          <span className="tabular-nums">{length}</span>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1 text-[10px]">
            <input
              type="checkbox"
              checked={symbols}
              onChange={(event) => setSymbols(event.target.checked)}
              className="size-3 accent-[var(--glacier-accent)]"
            />
            symbols
          </label>
          <div className="flex gap-1">
            <MiniButton onClick={generate}>Regenerate</MiniButton>
            <MiniButton onClick={() => navigator.clipboard?.writeText(password).catch(() => {})}>
              Copy
            </MiniButton>
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
}

/* --------------------------------------------------------------------- TOTP */

function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function totp(secret: string, period = 30, digits = 6): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counter = Math.floor(Date.now() / 1000 / period);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
  const offset = signature[signature.length - 1] & 0x0f;
  const code =
    ((signature[offset] & 0x7f) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function TotpTool({ id }: { id: string }) {
  const [secret, setSecret] = useWidgetStorage<string>(id, "secret", "");
  const [code, setCode] = useState("------");
  const [remaining, setRemaining] = useState(30);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      setRemaining(30 - (Math.floor(Date.now() / 1000) % 30));
      if (!secret.trim()) {
        setCode("------");
        return;
      }
      try {
        const next = await totp(secret.trim());
        if (alive) setCode(next);
      } catch {
        if (alive) setCode("error");
      }
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [secret]);

  return (
    <WidgetFrame title="Authenticator" hint={`${remaining}s`}>
      <div className="flex h-full flex-col justify-center gap-2">
        <div className="text-center font-mono text-2xl tracking-[0.2em]">{code}</div>
        <Field value={secret} onChange={setSecret} placeholder="Base32 secret" mono />
        <p className="text-[9px] leading-snug opacity-50">
          Codes are computed locally with WebCrypto HMAC-SHA1. The secret never leaves this widget's
          storage.
        </p>
      </div>
    </WidgetFrame>
  );
}

/* ---------------------------------------------------------------- utilities */

const UNITS: Record<string, Record<string, number>> = {
  Length: { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, in: 0.0254, cm: 0.01 },
  Mass: { kg: 1, g: 0.001, lb: 0.45359237, oz: 0.028349523 },
  Data: { MB: 1_048_576, GB: 1_073_741_824, TB: 1_099_511_627_776, KB: 1024 },
  Speed: { "km/h": 1, "mph": 1.609344, "m/s": 3.6 },
};

export function UnitTool({ id }: { id: string }) {
  const [category, setCategory] = useWidgetStorage<string>(id, "category", "Length");
  const [from, setFrom] = useWidgetStorage<string>(id, "from", "km");
  const [to, setTo] = useWidgetStorage<string>(id, "to", "mi");
  const [value, setValue] = useWidgetStorage<string>(id, "value", "10");
  const units = Object.keys(UNITS[category] ?? UNITS.Length);
  const numeric = Number(value.replace(",", "."));

  const converted = useMemo(() => {
    if (!Number.isFinite(numeric)) return "—";
    const table = UNITS[category] ?? UNITS.Length;
    const base = numeric * (table[from] ?? 1);
    const result = base / (table[to] ?? 1);
    return Number.isFinite(result) ? result.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—";
  }, [numeric, category, from, to]);

  const select = (options: string[], value: string, onChange: (v: string) => void) => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-md border border-[var(--glacier-border)] bg-black/25 px-1 py-1 text-[10px] outline-none"
    >
      {options.map((option) => (
        <option key={option} value={option} className="bg-slate-900">
          {option}
        </option>
      ))}
    </select>
  );

  return (
    <WidgetFrame title="Unit converter" hint={category}>
      <div className="flex h-full flex-col justify-center gap-2 text-[11px]">
        {select(Object.keys(UNITS), category, (next) => {
          setCategory(next);
          const first = Object.keys(UNITS[next])[0];
          setFrom(first);
          setTo(Object.keys(UNITS[next])[1] ?? first);
        })}
        <div className="flex items-end gap-1">
          <Field value={value} onChange={setValue} placeholder="0" />
          {select(units, from, setFrom)}
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-lg font-semibold tabular-nums">{converted}</span>
          {select(units, to, setTo)}
        </div>
      </div>
    </WidgetFrame>
  );
}

export function CalculatorTool({ id }: { id: string }) {
  const [expression, setExpression] = useWidgetStorage<string>(id, "expression", "128 * 1.2 + 9");
  const [history, setHistory] = useWidgetStorage<string[]>(id, "history", []);

  const result = useMemo(() => {
    // Deliberately narrow allow-list: digits, operators and parentheses only.
    if (!/^[\d\s+\-*/().%^]+$/.test(expression) || expression.trim() === "") return "";
    try {
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict";return (${expression.replace(/\^/g, "**")})`)();
      return Number.isFinite(value) ? String(Number(value.toFixed(10))) : "";
    } catch {
      return "";
    }
  }, [expression]);

  return (
    <WidgetFrame title="Calculator" hint={result ? `= ${result}` : undefined}>
      <div className="flex h-full flex-col gap-1.5">
        <Field value={expression} onChange={setExpression} mono placeholder="1 + 1" />
        <div className="text-right text-xl font-semibold tabular-nums">{result || "—"}</div>
        <div className="flex-1 space-y-0.5 overflow-y-auto">
          {history.slice(-4).reverse().map((line, index) => (
            <div key={`${line}-${index}`} className="truncate font-mono text-[10px] opacity-50">
              {line}
            </div>
          ))}
        </div>
        <MiniButton
          disabled={!result}
          onClick={() => setHistory((previous) => [...previous, `${expression} = ${result}`].slice(-20))}
        >
          Save to history
        </MiniButton>
      </div>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------- money */

export function MoneyTool({ id, variant }: { id: string; variant: "tip" | "split" | "hourly" }) {
  const [bill, setBill] = useWidgetStorage<string>(id, "bill", "48.50");
  const [rate, setRate] = useWidgetStorage<string>(id, "rate", "18");
  const [people, setPeople] = useWidgetStorage<string>(id, "people", "3");
  const [hours, setHours] = useWidgetStorage<string>(id, "hours", "6");

  const amount = Number(bill.replace(",", ".")) || 0;
  const tipPercent = Number(rate) || 0;
  const headcount = Math.max(1, Number(people) || 1);
  const hourly = Number(rate) || 0;
  const worked = Number(hours) || 0;

  if (variant === "hourly") {
    return (
      <WidgetFrame title="Hourly earnings">
        <div className="flex h-full flex-col justify-center gap-1.5">
          <Row label="Rate / h" value={`${hourly.toFixed(2)}`} />
          <Field value={hours} onChange={setHours} placeholder="hours" />
          <div className="text-center text-xl font-semibold tabular-nums">
            {(hourly * worked).toFixed(2)}
          </div>
        </div>
      </WidgetFrame>
    );
  }

  const tip = (amount * tipPercent) / 100;
  const total = amount + tip;

  return (
    <WidgetFrame title={variant === "tip" ? "Tip calculator" : "Split bill"}>
      <div className="flex h-full flex-col justify-center gap-1.5 text-[11px]">
        <Field value={bill} onChange={setBill} placeholder="bill" />
        <div className="flex gap-1">
          {[10, 15, 18, 20, 25].map((preset) => (
            <MiniButton key={preset} active={tipPercent === preset} onClick={() => setRate(String(preset))}>
              {preset}%
            </MiniButton>
          ))}
        </div>
        {variant === "split" && <Field value={people} onChange={setPeople} placeholder="people" />}
        <Row label="Tip" value={tip.toFixed(2)} />
        <Row label="Total" value={total.toFixed(2)} />
        {variant === "split" && <Row label={`Per person (${headcount})`} value={(total / headcount).toFixed(2)} />}
      </div>
    </WidgetFrame>
  );
}

export function CurrencyTool({ id }: { id: string }) {
  const [base, setBase] = useWidgetStorage<string>(id, "base", "USD");
  const [quote, setQuote] = useWidgetStorage<string>(id, "quote", "EUR");
  const [amount, setAmount] = useWidgetStorage<string>(id, "amount", "100");
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fxRates(base)
      .then((next) => alive && setRates(next))
      .catch((err: unknown) => alive && setError(String(err)));
    return () => {
      alive = false;
    };
  }, [base]);

  const value = Number(amount.replace(",", ".")) || 0;
  const rate = rates?.[quote.toUpperCase()];

  return (
    <WidgetFrame title="Currency" hint={rate ? `1 ${base} = ${rate.toFixed(4)} ${quote}` : "rates…"}>
      <div className="flex h-full flex-col justify-center gap-1.5 text-[11px]">
        <Field value={amount} onChange={setAmount} placeholder="amount" />
        <div className="flex gap-1">
          <Field value={base} onChange={(next) => setBase(next.toUpperCase())} mono />
          <span className="self-center opacity-50">→</span>
          <Field value={quote} onChange={(next) => setQuote(next.toUpperCase())} mono />
        </div>
        <div className="text-center text-xl font-semibold tabular-nums">
          {rate ? (value * rate).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
        </div>
        {error && <span className="truncate text-[9px] text-amber-300">{error}</span>}
      </div>
    </WidgetFrame>
  );
}

/* --------------------------------------------------------------------- fun */

export function DiceTool({ id, variant }: { id: string; variant: "dice" | "coin" | "picker" }) {
  const [sides, setSides] = useWidgetStorage<number>(id, "sides", 20);
  const [result, setResult] = useState("—");
  const [options, setOptions] = useWidgetStorage<string>(id, "options", "Pizza, Sushi, Tacos, Ramen");

  const roll = () => {
    if (variant === "dice") {
      const bytes = crypto.getRandomValues(new Uint32Array(1));
      setResult(String((bytes[0] % sides) + 1));
    } else if (variant === "coin") {
      const bytes = crypto.getRandomValues(new Uint8Array(1));
      setResult(bytes[0] % 2 === 0 ? "Heads" : "Tails");
    } else {
      const list = options.split(",").map((item) => item.trim()).filter(Boolean);
      const bytes = crypto.getRandomValues(new Uint32Array(1));
      setResult(list.length ? list[bytes[0] % list.length] : "—");
    }
  };

  return (
    <WidgetFrame title={variant === "dice" ? "Dice" : variant === "coin" ? "Coin flip" : "Random picker"}>
      <div className="flex h-full flex-col justify-center gap-2">
        <div className="text-center text-2xl font-semibold tabular-nums">{result}</div>
        {variant === "dice" && (
          <div className="flex justify-center gap-1">
            {[6, 8, 12, 20, 100].map((value) => (
              <MiniButton key={value} active={sides === value} onClick={() => setSides(value)}>
                d{value}
              </MiniButton>
            ))}
          </div>
        )}
        {variant === "picker" && (
          <Field value={options} onChange={setOptions} placeholder="comma separated" />
        )}
        <MiniButton onClick={roll}>Roll</MiniButton>
      </div>
    </WidgetFrame>
  );
}

export function ColorTool({ id }: { id: string }) {
  const [hex, setHex] = useWidgetStorage<string>(id, "hex", "#38bdf8");
  const color = /^#?[0-9a-f]{6}$/i.test(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : "#38bdf8";
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const contrastWhite = 1.05 / (luminance + 0.05);
  const contrastBlack = (luminance + 0.05) / 0.05;

  return (
    <WidgetFrame title="Colour" hint={color.toUpperCase()}>
      <div className="flex h-full flex-col gap-2">
        <div
          className="flex-1 rounded-lg border border-white/15"
          style={{ background: color }}
        />
        <Field value={hex} onChange={setHex} mono placeholder="#38bdf8" />
        <Row label="rgb" value={`${r}, ${g}, ${b}`} mono />
        <Row label="contrast" value={`${contrastWhite.toFixed(1)}:1 white · ${contrastBlack.toFixed(1)}:1 black`} />
      </div>
    </WidgetFrame>
  );
}

/* ---------------------------------------------------------------- audio/time */

export function MetronomeTool({ id }: { id: string }) {
  const [bpm, setBpm] = useWidgetStorage<number>(id, "bpm", 100);
  const [running, setRunning] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  const click = () => {
    const context = contextRef.current;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.05);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.05);
  };

  useEffect(() => {
    if (!running) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    contextRef.current ??= new AudioContext();
    click();
    timerRef.current = window.setInterval(click, (60_000 / bpm) | 0);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, bpm]);

  return (
    <WidgetFrame title="Metronome" hint={`${bpm} BPM`}>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className={`text-3xl ${running ? "animate-pulse" : "opacity-30"}`}>♩</span>
        <input
          type="range"
          min={40}
          max={208}
          value={bpm}
          onChange={(event) => setBpm(Number(event.target.value))}
          className="w-full accent-[var(--glacier-accent)]"
        />
        <MiniButton active={running} onClick={() => setRunning((value) => !value)}>
          {running ? "Stop" : "Start"}
        </MiniButton>
      </div>
    </WidgetFrame>
  );
}

export function BpmTool({ id }: { id: string }) {
  const tapsRef = useRef<number[]>([]);
  const [bpm, setBpm] = useState(0);
  const [taps, setTaps] = useState(0);
  useWidgetStorage<string>(id, "lastBpm", "");

  const tap = () => {
    const now = performance.now();
    const taps = [...tapsRef.current, now].slice(-8);
    tapsRef.current = taps;
    setTaps(taps.length);
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((time, index) => time - taps[index]);
      const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      setBpm(Math.round(60_000 / average));
    }
  };

  return (
    <WidgetFrame title="Tap tempo" hint={`${taps} taps`}>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-3xl font-semibold tabular-nums">{bpm || "—"}</span>
        <button
          type="button"
          onClick={tap}
          className="rounded-xl bg-[var(--glacier-accent)]/20 px-6 py-2 text-[11px] font-semibold active:scale-95"
        >
          Tap
        </button>
        <MiniButton
          onClick={() => {
            tapsRef.current = [];
            setTaps(0);
            setBpm(0);
          }}
        >
          Reset
        </MiniButton>
      </div>
    </WidgetFrame>
  );
}

export function BreathingTool() {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const [seconds, setSeconds] = useState(4);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((previous) => {
        if (previous > 1) return previous - 1;
        setPhase((current) => {
          if (current === "in") return "hold";
          if (current === "hold") return "out";
          return "in";
        });
        return phase === "in" ? 7 : phase === "hold" ? 8 : 4;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const scale = phase === "in" ? 1.25 : phase === "hold" ? 1.25 : 0.75;

  return (
    <WidgetFrame title="Box breathing" hint={phase}>
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-2">
          <div
            className="grid size-16 place-items-center rounded-full bg-[var(--glacier-accent)]/25 text-sm font-semibold transition-transform duration-1000 ease-linear"
            style={{ transform: `scale(${scale})` }}
          >
            {seconds}
          </div>
          <span className="text-[10px] uppercase tracking-widest opacity-60">
            {phase === "in" ? "Breathe in" : phase === "hold" ? "Hold" : "Breathe out"}
          </span>
        </div>
      </div>
    </WidgetFrame>
  );
}

export function CronTool({ id }: { id: string }) {
  const [expression, setExpression] = useWidgetStorage<string>(id, "cron", "*/15 9-17 * * 1-5");

  const explain = (cron: string) => {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return ["Expected 5 fields: minute hour day month weekday"];
    const [minute, hour, day, month, weekday] = parts;
    const describe = (field: string, unit: string, names?: string[]) => {
      if (field === "*") return `every ${unit}`;
      if (field.startsWith("*/")) return `every ${field.slice(2)} ${unit}s`;
      if (field.includes("-")) return `${unit} ${field.replace("-", " through ")}`;
      if (field.includes(",")) return `${unit} ${field.replace(/,/g, ", ")}`;
      return `${unit} ${names?.[Number(field)] ?? field}`;
    };
    return [
      `At ${describe(minute, "minute")}`,
      `of ${describe(hour, "hour")}`,
      `on ${describe(day, "day")}`,
      `in ${describe(month, "month")}`,
      `on ${describe(weekday, "weekday", ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])}`,
    ];
  };

  return (
    <WidgetFrame title="Cron helper">
      <div className="flex h-full flex-col gap-2">
        <Field value={expression} onChange={setExpression} mono placeholder="*/15 9-17 * * 1-5" />
        <div className="space-y-1">
          {explain(expression).map((line, index) => (
            <Row key={index} label={`f${index + 1}`} value={line} />
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}

export function PrivacyScoreTool({ id }: { id: string }) {
  const checks = [
    { key: "telemetry", label: "Local-only telemetry reviewed" },
    { key: "store", label: "Community store URL is trusted" },
    { key: "widgets", label: "Only bundled widgets installed" },
    { key: "feeds", label: "Feed widgets use HTTPS" },
    { key: "updates", label: "Updates checked over HTTPS" },
    { key: "backup", label: "Config backed up" },
  ];
  const [done, setDone] = useWidgetStorage<string[]>(id, "done", []);
  const score = Math.round((done.length / checks.length) * 100);

  return (
    <WidgetFrame title="Privacy score" hint={`${score}%`}>
      <div className="flex h-full flex-col gap-1">
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-emerald-400" style={{ width: `${score}%` }} />
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto text-[10px]">
          {checks.map((check) => (
            <label key={check.key} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={done.includes(check.key)}
                onChange={() =>
                  setDone((previous) =>
                    previous.includes(check.key)
                      ? previous.filter((entry) => entry !== check.key)
                      : [...previous, check.key],
                  )
                }
                className="size-3 accent-[var(--glacier-accent)]"
              />
              <span className={done.includes(check.key) ? "opacity-50" : ""}>{check.label}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => glacier.system.openSettings().catch(() => {})}
          className="rounded-md bg-white/10 py-1 text-[10px] hover:bg-white/20"
        >
          Open settings
        </button>
      </div>
    </WidgetFrame>
  );
}
