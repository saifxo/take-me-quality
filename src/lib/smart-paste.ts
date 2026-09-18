/**
 * Smart paste: turn rows copied from the call-recordings portal into call details.
 *
 * A portal row looks like (cells separated by tabs when copied from the browser):
 *   Queue  561 / 1465 - Sarah Patel - SOL - DE  07700900123  2026-08-31 02:12:07  00:01:25  » Play « » Download « » Email «
 *   Exten  James Ellis - BIR - BE  Sarah Patel - SOL - DE  2026-08-31 02:57:57  00:00:10  …
 *
 * The parser is deliberately forgiving: tabs or spaces, rows collapsed onto one line, cells split over
 * several lines, header rows, "» Play «" link text, UK or ISO dates, +44 numbers and withheld callers.
 * Anything it can't read comes back as an error entry, never an exception.
 */
import { isAnonymousCaller, maskPhone, normalizeUkPhone } from "./phone";
import { londonWallTimeToUtc, weekStartOf } from "./dates";

export type ParsedCall = {
  ok: true;
  index: number;
  raw: string;
  context: "queue" | "extension";
  queue: string | null;
  extension: string | null;
  agentName: string;
  siteCode: string | null;
  teamCode: string | null;
  /** Normalised caller number (client-side only — the server stores a mask + hash). */
  callerNumber: string | null;
  callerMasked: string | null;
  anonymousCaller: boolean;
  /** For extension calls: the internal party that placed the call. */
  internalParty: string | null;
  callAt: string; // ISO (UTC)
  callWeek: string; // Monday, YYYY-MM-DD
  durationSec: number;
};

export type ParseFailure = { ok: false; index: number; raw: string; reason: string };
export type ParseResult = ParsedCall | ParseFailure;

const DATE = String.raw`(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})`;
const TIME = String.raw`(\d{1,2}:\d{2}(?::\d{2})?)`;
const DUR = String.raw`((?:\d{1,2}:)?\d{1,2}:\d{2})`;
const NAME_CODES = String.raw`(.+?)\s+-\s+([A-Za-z]{2,8})\s+-\s+([A-Za-z]{1,6})`;

// Full record: context, optional "queue / ext -", agent, site, team, origination, date, time, duration.
const STRICT = new RegExp(
  String.raw`\b(Queue|Exten(?:sion)?)\s+(?:(\d{2,6})\s*\/\s*(\d{2,6})\s*-\s*)?${NAME_CODES}\s+(.+?)\s+${DATE}[ T]+${TIME}\s+${DUR}`,
  "gi",
);

// Looser single-line form: agent without site/team codes, caller must look like a number or be withheld.
const LOOSE = new RegExp(
  String.raw`^\s*(Queue|Exten(?:sion)?)?\s*(?:(\d{2,6})\s*\/\s*(\d{2,6})\s*-?\s*)?(.+?)\s+(\+?\d[\d ]{6,15}\d|anonymous|withheld|private|unknown)\s+${DATE}[ T]+${TIME}\s+${DUR}`,
  "i",
);

const HEADER = /^(context|destination|origination|date ?time|duration|options|\s)+$/i;
const PORTAL_LINKS = /»\s*(play|download|email)\s*«/gi;

function parseDate(d: string): { y: number; m: number; day: number } | null {
  let y: number, m: number, day: number;
  if (d.includes("/")) {
    // UK order: DD/MM/YYYY
    const [a, b, c] = d.split("/").map(Number);
    [day, m, y] = [a, b, c];
  } else {
    const [a, b, c] = d.split("-").map(Number);
    [y, m, day] = [a, b, c];
  }
  if (!y || m < 1 || m > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, day));
  if (probe.getUTCMonth() !== m - 1) return null;
  return { y, m, day };
}

function parseClock(t: string): { h: number; mi: number; s: number } | null {
  const [h, mi, s = 0] = t.split(":").map(Number);
  if (h > 23 || mi > 59 || s > 59) return null;
  return { h, mi, s };
}

function parseDur(t: string): number | null {
  const parts = t.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  if (s > 59 || (parts.length === 3 && m > 59)) return null;
  return h * 3600 + m * 60 + s;
}

const INTERNAL_PARTY = /^(.+?)\s+-\s+([A-Za-z]{2,8})\s+-\s+([A-Za-z]{1,6})$/;

function build(
  index: number,
  raw: string,
  ctxRaw: string | undefined,
  queue: string | undefined,
  ext: string | undefined,
  agent: string,
  site: string | undefined,
  team: string | undefined,
  origination: string,
  dateStr: string,
  timeStr: string,
  durStr: string,
): ParseResult {
  const date = parseDate(dateStr);
  const clock = parseClock(timeStr);
  const dur = parseDur(durStr);
  if (!date || !clock) return { ok: false, index, raw, reason: "The call date or time isn’t valid." };
  if (dur === null) return { ok: false, index, raw, reason: "The call duration isn’t valid." };

  const orig = origination.trim();
  const anonymous = isAnonymousCaller(orig);
  const phone = anonymous ? null : normalizeUkPhone(orig);
  const internal = !phone && !anonymous && INTERNAL_PARTY.test(orig) ? orig : null;
  const context: "queue" | "extension" =
    ctxRaw && /^exten/i.test(ctxRaw) ? "extension" : ctxRaw ? "queue" : internal ? "extension" : "queue";

  const callAt = londonWallTimeToUtc(date.y, date.m, date.day, clock.h, clock.mi, clock.s);
  const agentName = agent.replace(/\s+/g, " ").trim();
  if (!agentName || agentName.length > 80) return { ok: false, index, raw, reason: "Couldn’t find the agent’s name." };

  return {
    ok: true,
    index,
    raw,
    context,
    queue: queue ?? null,
    extension: ext ?? null,
    agentName,
    siteCode: site ? site.toUpperCase() : null,
    teamCode: team ? team.toUpperCase() : null,
    callerNumber: phone,
    callerMasked: anonymous ? "Withheld" : phone ? maskPhone(phone) : null,
    anonymousCaller: anonymous,
    internalParty: internal,
    callAt: callAt.toISOString(),
    callWeek: weekStartOf(callAt),
    durationSec: dur,
  };
}

export function parsePortalText(input: string, maxRows = 50): ParseResult[] {
  if (!input || !input.trim()) return [];
  const cleaned = input
    .replace(/\u00A0/g, " ") // non-breaking spaces from HTML tables
    .replace(PORTAL_LINKS, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, ""); // zero-width characters

  const found: Array<{ pos: number; result: ParseResult }> = [];
  const covered: Array<[number, number]> = [];

  STRICT.lastIndex = 0;
  for (let m = STRICT.exec(cleaned); m; m = STRICT.exec(cleaned)) {
    const raw = m[0].replace(/\s+/g, " ").trim();
    covered.push([m.index, m.index + m[0].length]);
    found.push({ pos: m.index, result: build(0, raw, m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10]) });
    if (found.length >= maxRows) break;
  }

  // Whatever the strict pass didn't consume: try the loose single-line form, else report it.
  const leftovers: Array<{ start: number; text: string }> = [];
  let cursor = 0;
  for (const [start, end] of covered) {
    leftovers.push({ start: cursor, text: cleaned.slice(cursor, start) });
    cursor = end;
  }
  leftovers.push({ start: cursor, text: cleaned.slice(cursor) });

  for (const chunk of leftovers) {
    let offset = chunk.start;
    for (const lineRaw of chunk.text.split("\n")) {
      const pos = offset;
      offset += lineRaw.length + 1;
      if (found.length >= maxRows) break;
      const line = lineRaw.replace(/\s+/g, " ").trim();
      if (!line || HEADER.test(line) || line.length < 8) continue;
      const lm = LOOSE.exec(line);
      if (lm) {
        found.push({ pos, result: build(0, line, lm[1], lm[2], lm[3], lm[4], undefined, undefined, lm[5], lm[6], lm[7], lm[8]) });
      } else if (/\d/.test(line)) {
        found.push({ pos, result: { ok: false, index: 0, raw: line, reason: "This row doesn’t look like a portal call row." } });
      }
    }
  }

  return found.sort((a, b) => a.pos - b.pos).map(({ result }, i) => ({ ...result, index: i }));
}

/** Case/space-insensitive key used to match portal names to the agent roster. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
