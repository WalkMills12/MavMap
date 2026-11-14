// Learns which kinds of events (and where) a student likes, entirely in this browser,
// and picks new upcoming events worth suggesting when the app starts.
import { hasEnded } from "./calendar.js";

const STORAGE_KEY = "mavmap.interests.v1";
const MAX_SEEN = 1500;
const MAX_SCORE = 30;
const SUGGEST_THRESHOLD = 3; // one saved event of a type is enough to suggest new ones of that type
const SUGGEST_LIMIT = 3;

// How much each action says about a student's interest.
const WEIGHTS = { favorite: 3, unfavorite: -2, calendar: 2, open: 1 };
const TYPE_FILTER_WEIGHT = 0.5;
const PLACE_FACTOR = 0.5; // location counts half as much as event type

const empty = () => ({ types: {}, places: {}, seen: [], suggested: [] });

function load() {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return empty();
  }
}

function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage blocked: nothing is learned this visit.
  }
}

const placeKey = (event) => (event.location || "").trim().toLowerCase();

function bump(map, key, amount) {
  if (!key) return;
  const next = Math.max(0, Math.min(MAX_SCORE, (map[key] || 0) + amount));
  if (next === 0) delete map[key];
  else map[key] = next;
}

/** action: "favorite" | "unfavorite" | "calendar" | "open" */
export function recordInterest(event, action) {
  const weight = WEIGHTS[action];
  if (!weight || !event) return;
  const data = load();
  for (const t of event.types || []) bump(data.types, t, weight);
  bump(data.places, placeKey(event), weight * PLACE_FACTOR);
  save(data);
}

export function recordTypeFilter(type) {
  if (!type) return;
  const data = load();
  bump(data.types, type, TYPE_FILTER_WEIGHT);
  save(data);
}

/** Top event types the student has shown interest in, highest first. */
export function topInterests(limit = 5) {
  const { types } = load();
  return Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

export function hasInterests() {
  const { types, places } = load();
  return Object.keys(types).length > 0 || Object.keys(places).length > 0;
}

/**
 * New events (not seen in an earlier visit, not already suggested or saved) that match the student's interests.
 * Returns [{ event, score, reasons: [typeName…] }].
 */
export function pickSuggestions(events, savedIds = new Set(), now = new Date()) {
  const data = load();
  if (!Object.keys(data.types).length && !Object.keys(data.places).length) return [];
  const seen = new Set(data.seen);
  const suggested = new Set(data.suggested);

  return events
    .filter((e) => e.start && !hasEnded(e, now) && !seen.has(e.id) && !suggested.has(e.id) && !savedIds.has(e.id))
    .map((e) => {
      const reasons = (e.types || []).filter((t) => data.types[t]).sort((a, b) => data.types[b] - data.types[a]);
      const typeScore = reasons.reduce((sum, t) => sum + data.types[t], 0);
      const placeScore = (data.places[placeKey(e)] || 0) * PLACE_FACTOR;
      return { event: e, score: typeScore + placeScore, reasons, place: placeScore > 0 ? e.location : null };
    })
    .filter((s) => s.score >= SUGGEST_THRESHOLD)
    .sort((a, b) => b.score - a.score || (a.event.start || "").localeCompare(b.event.start || ""))
    .slice(0, SUGGEST_LIMIT);
}

/** Remember these events as seen, so only events that appear later count as "new". */
export function markSeen(events) {
  const data = load();
  const ids = [...new Set([...events.map((e) => e.id), ...data.seen])];
  data.seen = ids.slice(0, MAX_SEEN);
  save(data);
}

export function markSuggested(ids) {
  const data = load();
  data.suggested = [...new Set([...ids, ...data.suggested])].slice(0, MAX_SEEN);
  save(data);
}

export function clearInterests() {
  save(empty());
}
