// "You may also like": upcoming events similar to the ones a student saved, each with the reason.
// Compares every upcoming event with every saved event: same host, same place, shared event
// types, and shared title words ("basketball", "diwali").

import { hasEnded } from "./calendar.js";

const STOP = new Set([
  "the", "and", "for", "with", "from", "your", "you", "our", "night", "day", "event", "events",
  "meeting", "general", "body", "uta", "mavs", "maverick", "mavericks", "fall", "spring", "2026",
  "2027", "club", "student", "students", "info", "session", "week",
]);
// Very common types only count a little on their own.
const BROAD_TYPES = new Set(["social", "meeting", "campus & community", "other"]);

const words = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 4 && !STOP.has(w));

const norm = (s) => String(s || "").trim().toLowerCase();

function compare(candidate, saved) {
  let score = 0;
  const why = [];
  if (candidate.host && norm(candidate.host) === norm(saved.host)) {
    score += 6;
    why.push(`same host (${candidate.host})`);
  }
  const shared = (candidate.types || []).filter((t) => (saved.types || []).includes(t));
  for (const t of shared) score += BROAD_TYPES.has(norm(t)) ? 1 : 2.5;
  if (shared.length) why.push(`also ${shared[0]}`);
  if (candidate.location && norm(candidate.location) === norm(saved.location)) {
    score += 3;
    why.push(`also at ${candidate.location}`);
  }
  const titleWords = new Set(words(saved.title));
  const common = [...new Set(words(candidate.title))].filter((w) => titleWords.has(w));
  if (common.length) {
    score += 4 * common.length;
    // Reason order: same host is the strongest signal, then the shared topic word.
    why.splice(why[0]?.startsWith("same host") ? 1 : 0, 0, `also about “${common[0]}”`);
  }
  return { score, why };
}

/**
 * Up to `limit` upcoming, unsaved events most like the saved ones, in date order.
 * Returns [{ event, because: savedEvent, reasons: [string] }].
 */
export function similarEvents(savedEvents, upcoming, { now = new Date(), limit = 8, minScore = 4 } = {}) {
  const saved = savedEvents.filter(Boolean);
  if (!saved.length) return [];
  const savedIds = new Set(saved.map((e) => e.id));
  const picks = [];
  for (const e of upcoming) {
    if (savedIds.has(e.id) || !e.start || hasEnded(e, now)) continue;
    let best = null;
    for (const s of saved) {
      const r = compare(e, s);
      if (!best || r.score > best.score) best = { ...r, because: s };
    }
    if (best && best.score >= minScore) picks.push({ event: e, because: best.because, reasons: best.why, score: best.score });
  }
  picks.sort((a, b) => b.score - a.score);
  // Show the best matches, but read left-to-right by date.
  return picks.slice(0, limit).sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));
}
