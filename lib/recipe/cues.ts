/**
 * How a step's "done when" cue is shown. Cues are kept as extracted; only the lead-in changes, by a
 * few fixed rules, so a fragment like "get golden" doesn't read "Done when get golden".
 */

/** Unambiguous verbs a cue may start with, without a subject ("get golden", "come to room temp"). */
const BARE_VERBS = new Set(["get", "turn", "become", "come", "reach", "start", "begin", "look", "feel", "smell", "thicken", "melt", "soften", "boil", "bubble", "rise", "float"]);

const thirdPerson = (verb: string) => (/(s|sh|ch|x|z)$/.test(verb) ? `${verb}es` : `${verb}s`);

export function doneCueText(cue: string): string {
  const c = cue.trim();
  const [first, ...rest] = c.split(/\s+/);
  if (BARE_VERBS.has(first.toLowerCase())) return `Done when it ${thirdPerson(first.toLowerCase())}${rest.length ? ` ${rest.join(" ")}` : ""}`;
  // "reading of 180F in the breast" → "Done at a reading of 180F in the breast"
  const reading = c.match(/^(an?\s+)?((?:internal\s+)?(?:reading|temperature)\s+of\b.*)$/i);
  if (reading) return `Done at ${reading[1] ?? "a "}${reading[2]}`;
  return `Done when ${c}`;
}
