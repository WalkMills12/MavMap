// Matches a typed question to a FAQ, a building, or a room ("NH 106").
// Pure functions: no React, no network.

const STOP_WORDS = new Set(
  (
    "a an the is are was were be do does did i im i'm me my we our you your it its to of in on at for " +
    "and or can could would should how what whats where wheres when who which there here please tell " +
    "about get find go need want know any some this that with from"
  ).split(" "),
);

const GREETING = /^\s*(hi|hello|hey|howdy|yo|good (morning|afternoon|evening))\b/i;
const THANKS = /^\s*(thanks|thank you|thx|ty|appreciate it)\b/i;

function stem(word) {
  if (word.length > 4) return word.replace(/(ing|es|s)$/, "");
  return word;
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter((w) => w && !STOP_WORDS.has(w))
    .map(stem);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Score how well a question matches one FAQ. Phrases count most, then keywords, then shared words. */
export function scoreFaq(faq, text) {
  const padded = ` ${normalize(text)} `;
  const tokens = tokenize(text);
  let score = 0;
  for (const keyword of faq.keywords || []) {
    const k = normalize(keyword);
    if (!k) continue;
    if (k.includes(" ")) {
      if (padded.includes(` ${k} `)) score += 3;
    } else if (tokens.includes(stem(k))) {
      score += 2;
    }
  }
  const questionTokens = new Set(tokenize(faq.question));
  for (const t of new Set(tokens)) if (questionTokens.has(t)) score += 1;
  return score;
}

export function rankFaqs(text, faqs) {
  return faqs
    .map((faq) => ({ faq, score: scoreFaq(faq, text) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function floorOf(room) {
  if (/^B/i.test(room)) return "basement level";
  const digits = room.replace(/\D/g, "");
  if (digits.length <= 2) return "1st floor";
  const n = Number(digits[0]);
  if (n === 0) return "ground level";
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${suffix} floor`;
}

/** Find the building a question mentions, by abbreviation or name. Earliest mention wins. */
export function findBuilding(text, buildings) {
  const padded = ` ${normalize(text)} `;
  let best = null;
  for (const b of buildings) {
    let pos = -1;
    for (const abbr of b.abbr || []) {
      // Two-letter codes (NH, UC, CH…) must be typed in capitals so words like "ch" don't match.
      const re = new RegExp(`\\b${escapeRegExp(abbr)}\\b`, abbr.length <= 2 ? "" : "i");
      const m = text.match(re);
      if (m && (pos < 0 || m.index < pos)) pos = m.index;
    }
    const name = normalize(b.name);
    const i = padded.indexOf(` ${name}`);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
    if (pos >= 0 && (!best || pos < best.pos)) best = { building: b, pos };
  }
  return best?.building ?? null;
}

/** Parse "NH 106", "ERB-228", "nh106", or "room 106 in Nedderman Hall". */
export function findRoom(text, buildings) {
  const codes = [];
  for (const b of buildings) for (const abbr of b.abbr || []) codes.push({ abbr: abbr.toUpperCase(), b });
  codes.sort((x, y) => y.abbr.length - x.abbr.length);
  if (codes.length) {
    const re = new RegExp(`\\b(${codes.map((c) => escapeRegExp(c.abbr)).join("|")})\\s*-?\\s*(B?\\d{2,4}[A-Z]?)\\b`, "i");
    const m = text.match(re);
    if (m) {
      const hit = codes.find((c) => c.abbr === m[1].toUpperCase());
      const room = m[2].toUpperCase();
      return { building: hit.b, room, floor: floorOf(room), label: `${hit.b.abbr?.[0] ?? hit.abbr} ${room}` };
    }
  }
  const m2 = text.match(/\broom\s*#?\s*(B?\d{2,4}[A-Z]?)\b/i);
  if (m2) {
    const building = findBuilding(text, buildings);
    if (building) {
      const room = m2[1].toUpperCase();
      return { building, room, floor: floorOf(room), label: `${building.abbr?.[0] ?? ""} ${room}`.trim() };
    }
  }
  return null;
}

/**
 * Build the bot's reply.
 * Returns { text, building?, link?, suggestions? } where suggestions is a list of FAQs to offer as chips.
 */
export function answerQuestion(text, { faqs = [], buildings = [] } = {}) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (GREETING.test(trimmed) && trimmed.split(/\s+/).length <= 3) {
    return {
      text: "Hi! Ask me a campus question, or type a room like NH 106 and I'll show you the building.",
      suggestions: faqs.filter((f) => f.featured).slice(0, 4),
    };
  }
  if (THANKS.test(trimmed)) return { text: "Happy to help. Go Mavs!" };

  const room = findRoom(trimmed, buildings);
  if (room) {
    const b = room.building;
    return {
      text:
        `${room.label} is in ${b.name}, on the ${room.floor}. ` +
        `UTA room numbers usually start with the floor number, so head to the ${room.floor} and follow the room signs.` +
        (b.address ? ` The building is at ${b.address}.` : ""),
      building: b,
    };
  }

  const ranked = rankFaqs(trimmed, faqs);
  const top = ranked[0];
  const building = findBuilding(trimmed, buildings);

  // Strong FAQ match (a phrase hit, or several keywords) wins over a bare building mention.
  if (top && top.score >= 3) {
    return faqReply(top.faq, buildings, ranked);
  }

  if (building) {
    return {
      text: `${building.name} (${(building.abbr || []).slice(0, 2).join(" / ")}) is at ${building.address}.`,
      building,
    };
  }

  if (top && top.score >= 2) return faqReply(top.faq, buildings, ranked);

  const suggestions = (ranked.length ? ranked.map((r) => r.faq) : faqs.filter((f) => f.featured)).slice(0, 4);
  return {
    text: faqs.length
      ? "I'm not sure about that one. Is it one of these? You can also type a room like ERB 228."
      : "I couldn't load the FAQ list, but I can still find rooms and buildings. Try “NH 106” or “Where is the library?”",
    suggestions,
  };
}

function faqReply(faq, buildings, ranked) {
  const building = faq.building ? buildings.find((b) => b.id === faq.building) ?? null : null;
  const related = ranked
    .slice(1)
    .filter((r) => r.score >= 2)
    .map((r) => r.faq)
    .slice(0, 2);
  return { text: faq.answer, building, link: faq.link, suggestions: related, faqId: faq.id };
}
