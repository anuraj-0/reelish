/** ISO 8601 durations as YouTube and schema.org use them: "PT27S", "PT5M13S", "PT1H2M", "P1DT2H". Seconds. */
export function parseIsoDuration(value: string): number | null {
  const v = value.trim().toUpperCase();
  const m = v.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!m || v === "P" || v.endsWith("T")) return null;
  const [, d, h, min, s] = m;
  return Math.round(Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0));
}

/** "40 minutes", "1 hour 30 minutes". */
export function describeMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m || !h) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return parts.join(" ");
}

const NUM = String.raw`(\d+(?:[.,]\d+)?|½|¼|¾)`;
const toNum = (s: string) => ({ "½": 0.5, "¼": 0.25, "¾": 0.75 })[s] ?? Number(s.replace(",", "."));

/**
 * Minutes from free text: "25–30 minutes" → {25, 30}; "1 hour" → {60}; "90 sec" → {1.5};
 * "a few minutes" → nulls. The raw text is always kept by the caller.
 */
export function parseDurationText(text: string): { minMinutes: number | null; maxMinutes: number | null } {
  const t = text.toLowerCase();
  const unitRe = String.raw`(hours?|hrs?|h\b|minutes?|mins?|m\b|seconds?|secs?|s\b)`;
  const m = t.match(new RegExp(String.raw`${NUM}\s*(?:(?:-|–|—|to)\s*${NUM})?\s*${unitRe}`));
  if (!m) return { minMinutes: null, maxMinutes: null };
  const unit = m[3];
  const factor = unit.startsWith("h") ? 60 : unit.startsWith("s") ? 1 / 60 : 1;
  const min = toNum(m[1]) * factor;
  const max = m[2] ? toNum(m[2]) * factor : null;
  // "1 hour 30 minutes"
  const extra = unit.startsWith("h") && !m[2] ? t.slice((m.index ?? 0) + m[0].length).match(/^\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?)/) : null;
  const total = extra ? min + Number(extra[1]) : min;
  if (!(total > 0)) return { minMinutes: null, maxMinutes: null };
  return { minMinutes: round(total), maxMinutes: max && max > total ? round(max) : null };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** "180°C", "350 F", "400 degrees Fahrenheit" → value + unit. */
export function parseTemperatureText(text: string): { value: number | null; unit: "C" | "F" | null } {
  const m = text.match(/(\d{2,3})\s*(?:°|º|degrees?)?\s*(c|f|celsius|fahrenheit)\b/i);
  if (!m) {
    const bare = text.match(/(\d{2,3})\s*(?:°|º|degrees?)/i);
    return { value: bare ? Number(bare[1]) : null, unit: null };
  }
  return { value: Number(m[1]), unit: m[2].toLowerCase().startsWith("c") ? "C" : "F" };
}

/** "1:05", "01:05", "1:02:03", "65" → seconds. */
export function parseTimestamp(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const m = v.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
