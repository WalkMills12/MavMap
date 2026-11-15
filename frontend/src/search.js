// Free-form campus search: names, MyMav abbreviations, keywords ("basketball" -> MAC, College
// Park Center) and category words ("parking", "dorm", "food"), with spelling correction
// ("kumpouter" -> "computer").

import { categoryLabel } from "./categories.js";

// Everyday words for each category, so "dorm" or "lunch" find the right kind of place.
const CATEGORY_WORDS = {
  parking: ["parking", "park", "car", "garage", "lot", "permit"],
  dining: ["food", "eat", "eating", "restaurant", "lunch", "dinner", "breakfast", "snack", "hungry", "dining"],
  housing: ["dorm", "dorms", "housing", "residence", "apartment", "apartments", "live", "living"],
  athletics: ["sports", "athletics", "ath", "games", "game", "mavericks", "arena"],
  recreation: ["rec", "recreation", "gym", "workout", "fitness", "exercise"],
  academic: ["class", "classes", "classroom", "lecture", "academic"],
  student_life: ["student", "students"],
  admin: ["office", "offices", "admin", "administration"],
};

// Words that carry no meaning on their own in a campus search.
const STOP = new Set(["the", "a", "an", "of", "at", "in", "on", "to", "for", "and", "where", "is", "uta", "building", "bldg", "hall", "near", "me", "i", "want", "find", "go", "get", "can"]);

export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(text) {
  return normalize(text).split(" ").filter(Boolean);
}

/** Rough "sounds like" form: kumpouter and computer both become kmptr. */
function phonetic(word) {
  return word
    .replace(/ph/g, "f")
    .replace(/ck|q/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/z/g, "s")
    .replace(/x/g, "ks")
    .replace(/(.)\1+/g, "$1")
    .replace(/(?!^)[aeiouyhw]/g, "");
}

/** Optimal string alignment distance (Levenshtein + adjacent swaps), stops early past `max`. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** Precompute what each place can be found by. Call once per buildings list. */
export function buildIndex(buildings) {
  const docs = buildings.map((b) => {
    const abbr = (b.abbr || []).map(normalize);
    const nameWords = [...new Set([...words(b.name), ...words(b.short)])];
    const keywords = (b.keywords || []).map(normalize);
    const keywordWords = keywords.flatMap((k) => k.split(" "));
    // Description and "what's here" are searchable too, but count less than names and keywords.
    const noteWords = [...new Set([...words(b.note), ...words(b.description), ...(b.offers || []).flatMap(words)])].filter(
      (w) => !STOP.has(w) && w.length >= 3,
    );
    const catWords = [...(CATEGORY_WORDS[b.category] || []), ...words(categoryLabel(b.category))];
    return { building: b, abbr, nameWords, name: normalize(b.name), short: normalize(b.short), keywords, keywordWords, noteWords, catWords };
  });

  const vocab = new Set();
  for (const d of docs) {
    for (const w of [...d.abbr, ...d.nameWords, ...d.keywordWords, ...d.noteWords, ...d.catWords]) {
      if (w.length >= 2 && !STOP.has(w)) vocab.add(w);
    }
  }
  const vocabList = [...vocab].map((w) => ({ word: w, sound: phonetic(w) }));
  return { docs, vocab, vocabList };
}

/** Closest known word to a typo, or null if nothing is close enough. */
function correctWord(word, index) {
  if (word.length < 3 || /\d/.test(word)) return null;
  const sound = phonetic(word);
  const maxEdits = word.length <= 4 ? 1 : word.length <= 7 ? 2 : 3;
  let best = null;
  for (const { word: cand, sound: candSound } of index.vocabList) {
    if (cand.length < 3) continue;
    // Spelling distance, with a discount when the words sound alike.
    let d = editDistance(word, cand, maxEdits);
    if (sound && candSound && sound === candSound) d = Math.min(d, 1);
    else if (sound.length >= 3 && editDistance(sound, candSound, 1) <= 1) d = Math.min(d, maxEdits);
    if (d > maxEdits) continue;
    const score = d * 10 + Math.abs(cand.length - word.length); // prefer similar length
    if (!best || score < best.score) best = { word: cand, score };
  }
  return best?.word ?? null;
}

function scoreDoc(doc, term) {
  let s = 0;
  if (doc.abbr.includes(term)) s = Math.max(s, 12);
  if (doc.nameWords.includes(term)) s = Math.max(s, 9);
  if (doc.keywordWords.includes(term)) s = Math.max(s, 8);
  if (term.length >= 2 && doc.abbr.some((a) => a.startsWith(term))) s = Math.max(s, 7);
  if (term.length >= 2 && doc.nameWords.some((w) => w.startsWith(term))) s = Math.max(s, 6);
  if (term.length >= 3 && doc.keywordWords.some((w) => w.startsWith(term))) s = Math.max(s, 5);
  if (doc.catWords.includes(term)) s = Math.max(s, 4);
  if (doc.noteWords.includes(term)) s = Math.max(s, 4);
  if (term.length >= 3 && doc.noteWords.some((w) => w.startsWith(term))) s = Math.max(s, 3);
  return s;
}

/** Which keyword made a place match, to show as a hint ("basketball"). */
function matchedKeyword(doc, terms) {
  return doc.building.keywords?.find((k) => terms.some((t) => normalize(k).split(" ").includes(t))) ?? null;
}

/**
 * Search places. Returns { results: [{ building, score, hint }], corrected } where `corrected`
 * is the spelling-fixed query when we changed any word (e.g. "computer"), else null.
 */
export function searchPlaces(index, query, { limit = 50 } = {}) {
  const raw = words(query);
  if (!raw.length || !index) return { results: [], corrected: null };

  const fullQuery = raw.join(" ");
  let terms = raw.filter((w) => !STOP.has(w));
  if (!terms.length) terms = raw;

  // Fix words we don't know (but leave half-typed prefixes like "nedd" alone).
  let changed = false;
  const fixed = terms.map((t) => {
    if (index.vocab.has(t)) return t;
    if (t.length >= 2 && index.vocabList.some(({ word }) => word.startsWith(t))) return t;
    const c = correctWord(t, index);
    if (c && c !== t) {
      changed = true;
      return c;
    }
    return t;
  });

  const results = [];
  for (const doc of index.docs) {
    let total = 0;
    let hits = 0;
    for (const t of fixed) {
      const s = scoreDoc(doc, t);
      if (s) hits += 1;
      total += s;
    }
    // Whole-phrase bonus: "college park", "dining hall", "computer science".
    if (fixed.length > 1) {
      const phrase = fixed.join(" ");
      if (doc.name.includes(phrase)) total += 25;
      if (doc.keywords.some((k) => k.includes(phrase))) total += 8;
    }
    if (doc.name === fullQuery || doc.short === fullQuery || doc.abbr.includes(fullQuery.replace(/ /g, ""))) total += 20;
    // The official code (first abbreviation) wins outright: "PH" is Preston Hall.
    if (doc.abbr[0] && doc.abbr[0] === fullQuery.replace(/ /g, "")) total += 15;
    if (!hits) continue;
    // Places matching every word beat ones matching just one.
    total += hits === fixed.length ? 5 : 0;
    results.push({ building: doc.building, score: total, hint: matchedKeyword(doc, fixed) });
  }

  results.sort((a, b) => b.score - a.score || a.building.name.localeCompare(b.building.name));
  return { results: results.slice(0, limit), corrected: changed ? fixed.join(" ") : null };
}

/** Events whose title, type or place mention the (corrected) query. */
export function searchEvents(events, query, limit = 3) {
  const terms = words(query).filter((w) => !STOP.has(w) && w.length >= 3);
  if (!terms.length) return [];
  return events
    .map((e) => {
      const hay = normalize([e.title, e.location, e.host, ...(e.types || [])].join(" "));
      const hits = terms.filter((t) => hay.includes(t)).length;
      return { e, hits };
    })
    .filter((x) => x.hits === terms.length)
    .slice(0, limit)
    .map((x) => x.e);
}
