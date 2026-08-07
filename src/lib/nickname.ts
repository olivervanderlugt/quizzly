/**
 * Nickname screening for game joins.
 *
 * A nickname box in a classroom gets misused; the host can kick, but the slur
 * has been on the projector by then. This is a modest automatic gate in front
 * of that, not a moderation system.
 *
 * Two lists with different matching rules, because the failure modes differ:
 *
 *  - `BLOCKED_ANYWHERE`: long, unambiguous terms matched as substrings of the
 *    normalised name, so "xX_f4ggot_Xx" is caught. Everything here is chosen
 *    to be very unlikely inside an innocent name (the Scunthorpe problem is
 *    real — "ass" or "kut" as substrings would block Cassandra and Kuttner).
 *    Scunthorpe itself is the one accepted casualty: the slur it contains is
 *    too abused to leave off the list, and the town rarely joins a quiz.
 *  - `BLOCKED_EXACT`: short or embeddable terms blocked only when they *are*
 *    the whole name, so "nazi" is refused but "Ashkenazi" is not.
 *
 * Normalisation folds the usual evasions: case, leetspeak digits/symbols, and
 * separator characters. A blocked legit name is worse UX than a missed insult
 * (the host can still kick), so when extending the lists, err that way.
 */

const BLOCKED_ANYWHERE = [
  // English
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "asshole",
  "dickhead",
  "wanker",
  "whore",
  "slut",
  "rapist",
  "hitler",
  // Dutch — the audience this was built in
  "kanker",
  "tering",
  "klootzak",
  "mongool",
  "godverdomme",
];

const BLOCKED_EXACT = [
  "nazi",
  "kkk",
  "anus",
  "penis",
  "hoer",
  "kut",
  "lul",
  "fag",
  "cock",
];

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  "$": "s",
  "!": "i",
  "+": "t",
};

/** Lowercase, fold leetspeak, drop everything that isn't a letter. */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .split("")
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-z]/g, "");
}

function isBlocked(raw: string): boolean {
  const flat = normalize(raw);
  // "fuuuck" defeats a plain substring check; collapsing letter runs to a
  // single character catches stretched spellings without touching short names.
  const collapsed = flat.replace(/(.)\1+/g, "$1");

  for (const term of BLOCKED_ANYWHERE) {
    if (flat.includes(term) || collapsed.includes(term)) return true;
  }
  return BLOCKED_EXACT.some((term) => flat === term || collapsed === term);
}

export type NicknameResult =
  | { ok: true; nickname: string }
  | { ok: false; error: string };

export function sanitizeNickname(raw: string): NicknameResult {
  const clean = raw.trim().replace(/\s+/g, " ").slice(0, 20);
  if (clean.length < 1) return { ok: false, error: "Pick a nickname." };
  if (isBlocked(clean)) {
    return { ok: false, error: "Pick a friendlier nickname." };
  }
  return { ok: true, nickname: clean };
}
