import type { Quantity } from "./schema";

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4,
  "⅕": 1 / 5, "⅖": 2 / 5, "⅗": 3 / 5, "⅘": 4 / 5, "⅙": 1 / 6,
  "⅚": 5 / 6, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8,
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join("");

// One number: "1 1/2", "1/2", "2", "1.5", "½", "1½", "1 ½". Fraction forms come first so
// "1/2" isn't read as "1" followed by a unit of "/2".
const NUMBER = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?(?:\\s*[${FRACTION_CHARS}])?|[${FRACTION_CHARS}])`;
const LEADING = new RegExp(`^(${NUMBER})(?:\\s*(?:-|–|—|to)\\s*(${NUMBER}))?\\s*(.*)$`, "i");

function toNumber(token: string): number | null {
  const t = token.trim().replace(",", ".");
  let total = 0;
  let matched = false;
  for (const part of t.split(/\s+/)) {
    const m = part.match(new RegExp(`^(\\d+(?:\\.\\d+)?)?([${FRACTION_CHARS}])?$`));
    if (m && (m[1] || m[2])) {
      total += (m[1] ? parseFloat(m[1]) : 0) + (m[2] ? UNICODE_FRACTIONS[m[2]] : 0);
      matched = true;
      continue;
    }
    const f = part.match(/^(\d+)\/(\d+)$/);
    if (f && Number(f[2]) !== 0) {
      total += Number(f[1]) / Number(f[2]);
      matched = true;
      continue;
    }
    return null;
  }
  return matched && total > 0 ? total : null;
}

/**
 * Parse a quantity string a person or creator wrote. Always keeps `raw`;
 * amount/unit are best-effort (null when the text isn't numeric, e.g. "a drizzle").
 */
export function parseQuantity(input: string): Quantity | null {
  const raw = input.trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const m = raw.match(LEADING);
  if (!m) return { raw, amount: null, amountMax: null, unit: null };
  const amount = toNumber(m[1]);
  const amountMax = m[2] ? toNumber(m[2]) : null;
  const rest = m[3].trim();
  // "150g" -> unit "g"; "2 cloves (quartered)" -> unit "cloves"
  const unit = rest ? (rest.match(/^[^\s(,]+/)?.[0] ?? null) : null;
  if (amount === null) return { raw, amount: null, amountMax: null, unit: null };
  return { raw, amount, amountMax: amountMax && amountMax > amount ? amountMax : null, unit };
}
