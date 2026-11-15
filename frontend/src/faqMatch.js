// Matches a typed question to an answer: a FAQ, a "where can I…" topic, a building or code,
// a room ("NH 106"), or the student's own classes. Pure functions: no React, no network.
import { APP_TOPICS, TOPICS, utaSearchUrl } from "./campusAnswers.js";

const STOP_WORDS = new Set(
  (
    "a an the is are was were be do does did i im i'm me my we our you your it its to of in on at for " +
    "and or can could would should how what whats where wheres when who which there here please tell " +
    "about get find go need want know any some this that with from"
  ).split(" "),
);

// Words too common to identify a place on their own in the open-ended place search.
const GENERIC = new Set(
  "building hall center centre campus uta student students place room office near nearest closest best good like play go get "
    .concat("join help coming there anything something have has ")
    .concat("use take class classes open hour hours time lot lots spot spots area way around inside outside new old main north south east west ")
    .concat("parking surface garage residence apartment apartments")
    .split(" ")
    .filter(Boolean),
);

// Building aliases that are also everyday words ("college", "Texas", "UT Arlington"): only the full name counts.
const WEAK_ALIASES = new Set(["COLLEGE", "SCIENCE", "TEXAS", "ARLINGTON", "BUSINESS", "EARTH", "ADMIN", "WEST", "MAVERICK HALL"]);
// Two-letter codes that are also things people type ("uh…").
const LOWERCASE_UNSAFE = new Set(["UH"]);

const GREETING = /^\s*(hi|hello|hey|howdy|yo|sup|good (morning|afternoon|evening))\b/i;
const THANKS = /^\s*(thanks|thank you|thx|ty|appreciate it|cool|ok|okay|great|awesome)\b/i;
const HELP = /^\s*(help|what can you do|what do you do|how does this work|commands|\?)\s*\??\s*$/i;
const CODES_QUESTION = /\b(abbreviation|abbreviations|abbreviated|acronyms?|building codes?|codes? for|short names?|short forms?|what do the letters|list (of )?(the )?buildings|all (the )?buildings)\b/i;
const STAND_FOR = /\b(stand for|stands for|short for|mean|means|meaning|abbreviation for|full name)\b/i;
const MY_CLASS =
  /\bnext (class|lecture|lab|course)\b|\b(where|when|what time|which building|what building|how far|how long)\b.*\bmy\b.*\b(class|classes|lecture|lab|course)\b|\bclass(es)? (today|tomorrow)\b/i;

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

function metersBetween(a, b) {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 110540);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** How strongly some text mentions a list of trigger words: phrases count 3, single words 2. */
function scoreWords(words, padded, tokens) {
  let score = 0;
  for (const word of words || []) {
    const k = normalize(word);
    if (!k) continue;
    if (k.includes(" ")) {
      if (padded.includes(` ${k} `)) score += 3;
    } else if (tokens.includes(stem(k))) {
      score += 2;
    }
  }
  return score;
}

/** Score how well a question matches one FAQ. Phrases count most, then keywords, then shared words. */
export function scoreFaq(faq, text) {
  const padded = ` ${normalize(text)} `;
  const tokens = tokenize(text);
  let score = scoreWords(faq.keywords, padded, tokens);
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

export function rankTopics(text, topics = TOPICS) {
  const padded = ` ${normalize(text)} `;
  const tokens = tokenize(text);
  return topics
    .map((topic) => ({ topic, score: scoreWords(topic.words, padded, tokens) }))
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

/** Every place a question mentions by code or name, earliest (then longest) mention first. */
export function findBuildings(text, buildings) {
  const padded = ` ${normalize(text)} `;
  const hits = [];
  for (const b of buildings) {
    let best = null;
    for (const abbr of b.abbr || []) {
      const code = abbr.toUpperCase();
      if (WEAK_ALIASES.has(code)) continue;
      // Short codes match in any case ("nh", "erb"), except the few that are also words people type.
      const strict = code.length <= 2 && LOWERCASE_UNSAFE.has(code);
      const m = text.match(new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(abbr)}(?![A-Za-z])`, strict ? "" : "i"));
      if (m && (!best || m.index < best.pos || (m.index === best.pos && abbr.length > best.len))) best = { pos: m.index, len: abbr.length };
    }
    for (const name of [b.name, b.name.replace(/\s*\(.*\)$/, "")]) {
      const n = normalize(name);
      if (n.length < 4) continue;
      const i = padded.indexOf(` ${n}`);
      if (i >= 0 && (!best || i < best.pos || (i === best.pos && n.length > best.len))) best = { pos: i, len: n.length };
    }
    if (best) hits.push({ building: b, ...best });
  }
  hits.sort((a, b) => a.pos - b.pos || b.len - a.len);
  // Drop a shorter match that sits inside a longer one ("Starbucks" inside "Starbucks (University Center)").
  const out = [];
  for (const h of hits) {
    if (out.some((o) => h.pos >= o.pos && h.pos + h.len <= o.pos + o.len && o.len > h.len)) continue;
    out.push(h);
  }
  return out.map((h) => h.building);
}

/** The first building a question mentions, by code or name. */
export function findBuilding(text, buildings) {
  return findBuildings(text, buildings)[0] ?? null;
}

/** Parse "NH 106", "ERB-228", "nh106", or "room 106 in Nedderman Hall". */
export function findRoom(text, buildings) {
  const codes = [];
  for (const b of buildings) for (const abbr of b.abbr || []) if (!WEAK_ALIASES.has(abbr.toUpperCase())) codes.push({ abbr: abbr.toUpperCase(), b });
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
  const m2 = text.match(/\b(?:room|rm\.?)\s*#?\s*(B?\d{2,4}[A-Z]?)\b/i);
  if (m2) {
    const building = findBuilding(text, buildings);
    if (building) {
      const room = m2[1].toUpperCase();
      return { building, room, floor: floorOf(room), label: `${building.abbr?.[0] ?? ""} ${room}`.trim() };
    }
  }
  return null;
}

/** Places whose name or description shares a meaningful word with the question ("tacos" → Rusty Taco). */
export function searchPlaces(text, buildings, limit = 4) {
  const tokens = [...new Set(tokenize(text))].filter((t) => t.length >= 3 && !GENERIC.has(t));
  if (!tokens.length) return [];
  const scored = [];
  for (const b of buildings) {
    const hay = new Set(tokenize(`${b.name} ${b.note || ""}`));
    let score = 0;
    for (const t of tokens) if (hay.has(t) || hay.has(stem(t.replace(/s$/, "")))) score += 1;
    if (score) scored.push({ b, score });
  }
  scored.sort((a, b) => b.score - a.score || a.b.name.localeCompare(b.b.name));
  const top = scored[0]?.score ?? 0;
  return scored.filter((s) => s.score === top).slice(0, limit).map((s) => s.b);
}

/** "Nedderman Hall (NH) · Engineering classrooms · 416 Yates St" */
function describeBuilding(b) {
  const codes = (b.abbr || []).filter((a) => !WEAK_ALIASES.has(a.toUpperCase()) && a.length <= 6).slice(0, 2);
  let text = `${b.name}${codes.length ? ` (${codes.join(" / ")})` : ""}`;
  if (b.note) text += `: ${b.note.replace(/\.$/, "")}.`;
  else text += ".";
  text += b.address ? ` It's at ${b.address}.` : " Tap “Show on map” to see where it is.";
  return text;
}

function codeList(buildings) {
  return buildings
    .filter((b) => b.abbr?.length && !["parking", "dining"].includes(b.category))
    .map((b) => ({ code: b.abbr[0].toUpperCase(), b }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function placesReply(text, places, extra = {}) {
  const list = places.filter(Boolean);
  return { text, places: list, building: list.length === 1 ? list[0] : undefined, ...extra };
}

/**
 * Build the bot's reply.
 * Returns { text, building?, places?, link?, suggestions? } — `places` are offered as "Show on map" chips.
 * Options: faqs, buildings, classes (the student's schedule, for "where is my next class?"), now.
 */
export function answerQuestion(text, { faqs = [], buildings = [], classes = [], events = [], now = new Date(), nextClassFn } = {}) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const byId = (id) => buildings.find((b) => b.id === id);

  if (GREETING.test(trimmed) && trimmed.split(/\s+/).length <= 3) {
    return {
      text: "Hi! Ask me anything about UTA (“how do I join a club?”, “where can I play basketball?”, “where is ERB?”), type a room like NH 106, or ask how to use MavMap.",
      suggestions: faqs.filter((f) => f.featured).slice(0, 4),
    };
  }
  if (THANKS.test(trimmed) && trimmed.split(/\s+/).length <= 4) return { text: "Happy to help. Go Mavs!" };
  if (HELP.test(trimmed)) {
    return {
      text:
        "I can:\n• find a room: “NH 106”, “ERB 228”\n• find a building by code or name: “where is SEIR?”, “what does COBA stand for?”\n• point you to places: “where can I play basketball / get coffee / park?”\n• tell you about UTA life: clubs, Greek life, intramurals, careers, tuition, scholarships, study abroad and more\n• find events: “any club meetings this week?”\n• explain the app: “how do I get directions / upload my schedule / switch to dark mode?”\n• tell you where your next class is, once you add your schedule in the Classes tab\nIf I don't know something, I'll give you a uta.edu search for it.",
      suggestions: faqs.filter((f) => f.featured).slice(0, 3),
    };
  }

  // The student's own schedule.
  if (MY_CLASS.test(trimmed)) {
    if (!classes.length) {
      return { text: "You haven't added your classes yet. Open the side menu, pick Classes, and upload your schedule PDF or add classes by hand. Then I can tell you where your next class is." };
    }
    const next = nextClassFn?.(classes, now);
    if (!next) return { text: "None of your saved classes meet in the next week." };
    const c = next.cls;
    const b = byId(c.buildingId);
    const when = next.inProgress ? "is happening now" : `starts ${next.startsAt.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" })}`;
    const where = c.online ? "It's online." : b ? `It's in ${b.name}${c.room ? `, room ${c.room} (${floorOf(c.room)})` : ""}.` : "I don't know its building yet. Set it in the Classes tab.";
    return { text: `Your next class, ${c.course}${c.title ? ` ${c.title}` : ""}, ${when}. ${where}`, building: b || undefined };
  }

  // "What are the building abbreviations?"
  if (CODES_QUESTION.test(trimmed)) {
    const list = codeList(buildings);
    return {
      text: `Building codes (the letters in room numbers like NH 106):\n${list.map((x) => `${x.code}: ${x.b.name}`).join("\n")}`,
    };
  }

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

  const mentioned = findBuildings(trimmed, buildings);

  // "How do I…" about MavMap itself.
  const appTop = rankTopics(trimmed, APP_TOPICS)[0];
  const aboutApp = APP_CONTEXT.test(trimmed);
  if (appTop && (appTop.score >= 3 || (appTop.score >= 2 && aboutApp))) {
    const t = appTop.topic;
    // "How do I get to ERB?": point at that building's directions button.
    if (t.id === "app-directions" && mentioned.length) {
      const b = mentioned[0];
      return { text: `Tap ➤ Get directions below for live ${b.name} directions. Allow location when asked, and pick 🚶 Walk or 🚗 Drive at the bottom.`, building: b };
    }
    return { text: t.text, app: true };
  }

  // "What's happening this week?" / "any coding events?": search the live UTA events list.
  if (EVENT_QUESTION.test(trimmed) && events.length) {
    const hits = searchEvents(trimmed, events, [], now);
    const list = hits.length ? hits : upcomingEvents(events, now).slice(0, 4);
    if (list.length) {
      return {
        text: !hits.length
          ? "Nothing matched exactly, but here's what's coming up on campus:"
          : hits.exact
            ? "Here's what I found on the UTA events calendar:"
            : "I didn't find an exact match. These are the closest events on the UTA calendar:",
        events: list,
        building: undefined,
      };
    }
  }

  // "What does ERB stand for?"
  if (mentioned.length && STAND_FOR.test(trimmed)) {
    const b = mentioned[0];
    const code = (b.abbr || []).find((a) => new RegExp(`\\b${escapeRegExp(a)}\\b`, "i").test(trimmed)) || b.abbr?.[0];
    const rest = `${b.note ? ` ${b.note.replace(/\.$/, "")}.` : ""}${b.address ? ` It's at ${b.address}.` : ""}`;
    return { text: `${code ? `${code.toUpperCase()} stands for ${/^the /i.test(b.name) ? "" : "the "}` : ""}${b.name}.${rest}`, building: b };
  }

  // Parking: lot numbers, who can park where, and the closest lots to a building.
  const parkingReply = answerParking(trimmed, buildings, mentioned);
  if (parkingReply) return parkingReply;

  const ranked = rankFaqs(trimmed, faqs);
  const topFaq = ranked[0];
  const topics = rankTopics(trimmed);
  const topTopic = topics[0];

  // A clear "where can I…" topic or FAQ beats a bare building mention.
  if (topTopic && topTopic.score >= 2 && (!topFaq || topTopic.score >= topFaq.score || topTopic.topic.priority)) {
    const t = topTopic.topic;
    // Topics like clubs and careers also pull matching events from the live calendar.
    let related = [];
    if (t.events && events.length) related = searchEvents(trimmed, events, t.events, now);
    if (!related.length && t.showUpcoming) related = upcomingEvents(events, now).slice(0, 4);
    return placesReply(t.text, (t.places || []).map(byId), {
      link: t.link,
      linkLabel: t.linkLabel,
      category: t.category,
      events: related.length ? related : undefined,
    });
  }
  if (topFaq && topFaq.score >= 3) {
    const reply = faqReply(topFaq.faq, buildings, ranked);
    // The FAQ explains; the matching topic (if any) adds the places to show.
    if (topTopic && topTopic.score >= 2 && !reply.building) {
      return { ...reply, places: (topTopic.topic.places || []).map(byId).filter(Boolean), category: topTopic.topic.category };
    }
    return reply;
  }

  if (mentioned.length) {
    if (mentioned.length > 1) {
      return placesReply(mentioned.slice(0, 4).map(describeBuilding).join("\n"), mentioned.slice(0, 4));
    }
    return { text: describeBuilding(mentioned[0]), building: mentioned[0] };
  }

  if (topFaq && topFaq.score >= 2) return faqReply(topFaq.faq, buildings, ranked);

  // Last try: a place whose name or description matches ("tacos", "pizza", "child development").
  const found = searchPlaces(trimmed, buildings);
  if (found.length) {
    return placesReply(
      found.length === 1 ? describeBuilding(found[0]) : `Here's what I found:\n${found.map((b) => `• ${b.name}${b.note ? `: ${b.note.replace(/\.$/, "")}` : ""}`).join("\n")}`,
      found,
    );
  }

  // Events whose title or description matches ("robotics", "career fair", "hackathon").
  if (events.length) {
    const hits = searchEvents(trimmed, events, [], now, 3, { titleOnly: true });
    if (hits.length && hits.exact) return { text: "I don't have a set answer for that, but these UTA events match. For more, search uta.edu:", events: hits, ...searchLink(trimmed) };
  }

  // Weaker app match ("theme?", "favorites"): still better than nothing.
  if (appTop && appTop.score >= 2) return { text: appTop.topic.text, app: true };

  // Nothing local: hand off to a uta.edu search so the student can still find it.
  const suggestions = (ranked.length ? ranked.map((r) => r.faq) : faqs.filter((f) => f.featured)).slice(0, 3);
  return {
    text:
      "I don't have that one in MavMap yet, but UTA's website will. Tap the search below to see uta.edu's pages about it." +
      (faqs.length ? " Or try one of these:" : ""),
    ...searchLink(trimmed),
    suggestions,
  };
}

// ---------- Parking ----------
const PARKING_MAP = "https://www.uta.edu/pats/maps/Visitor-Parking-Map---2026.pdf";
const COMMUTER_MAP = "https://www.uta.edu/pats/news/2025/Student-Commuter-Zones-Parking-Map---20262.pdf";
// "lot"/"lots" only count when they aren't "a lot of" / "lots of".
const PARKING_WORDS = /\b(park|parking|garages?|permit|permits|visitor parking|hourly)\b|\blots?\b(?!\s+of\b)/i;
// "lot 49", "lot F10", "lot 50n", "lot CN"; also a bare faculty code like "F10".
const LOT_CODE = /\blots?\s*#?\s*([a-z]?\d{1,2}[ns]?|[a-z]{2})\b|\b(f\d{1,2})\b/i;
const PERMIT_WORDS = [
  ["faculty", /\b(faculty|staff|employee|employees|professor|f lots?)\b/i],
  ["resident", /\b(resident|residents|dorm|live on campus|residence hall|apartment|kc hall|kalpana|meadow run|arbor oaks|university village|west campus residence|greek row)\b/i],
  ["visitor", /\b(visitor|visitors|visiting|guest|guests|hourly|pay to park|no permit|without a permit|daily parking|family|parents)\b/i],
  ["student", /\b(student|students|commuter|commuters|commute)\b/i],
];
const PERMIT_LABEL = { student: "student permit", faculty: "faculty/staff permit", resident: "resident permit", visitor: "visitor (pay) parking" };
const naturalSort = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });

function lotCodes(b) {
  return (b.lots || []).map((c) => c.toUpperCase());
}

function nearestBuildingsTo(p, buildings, n = 2) {
  return buildings
    .filter((b) => !["parking", "dining"].includes(b.category))
    .map((b) => ({ b, d: metersBetween(b, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

const walkMin = (m) => Math.max(1, Math.round(m / 80));

function describeLot(lot, buildings) {
  const near = nearestBuildingsTo(lot, buildings, 2);
  const who = (lot.permit || []).map((k) => PERMIT_LABEL[k]).filter(Boolean).join(" and ") || "permit";
  return (
    `${lot.name} is a ${who} lot` +
    (lot.address ? ` at ${lot.address.replace(/, Arlington, TX$/, "")}` : "") +
    (near.length ? `, next to ${near.map((x) => x.b.name).join(" and ")} (about ${walkMin(near[0].d)} min walk)` : "") +
    ". You need the matching UTA permit at all times; check the sign at the entrance."
  );
}

function lotsFor(kind, buildings) {
  if (kind === "visitor") {
    return ["maverick-garage", "west-garage", "park-south"].map((id) => buildings.find((b) => b.id === id)).filter(Boolean);
  }
  const lots = buildings.filter((b) => b.category === "parking" && (b.permit || []).includes(kind) && b.lots?.length).sort(naturalSort);
  if (kind === "student") {
    const garages = ["park-north", "park-central", "park-south", "west-garage"].map((id) => buildings.find((b) => b.id === id)).filter(Boolean);
    return [...garages, ...lots];
  }
  return lots;
}

function permitKind(text) {
  for (const [kind, re] of PERMIT_WORDS) if (re.test(text)) return kind;
  return null;
}

export function answerParking(text, buildings, mentioned = []) {
  const parking = buildings.filter((b) => b.category === "parking");
  if (!parking.length) return null;

  // "Where is lot 49?" / "lot F10" / "what is lot CN"
  const m = text.match(LOT_CODE);
  if (m) {
    const code = (m[1] || m[2]).toUpperCase();
    const lot = parking.find((b) => lotCodes(b).includes(code)) || parking.find((b) => lotCodes(b).some((c) => c.replace(/[NS]$/, "") === code));
    if (lot) {
      const siblings = code === "50" ? parking.filter((b) => lotCodes(b).some((c) => c.startsWith("50"))) : [lot];
      if (siblings.length > 1) {
        return placesReply(`Lot 50 has two parts, both student permit lots off S. West St.:\n${siblings.map((b) => `• ${describeLot(b, buildings)}`).join("\n")}`, siblings, { category: "parking" });
      }
      return { text: describeLot(lot, buildings), building: lot, category: "parking" };
    }
    if (/^(F?\d{1,2}[NS]?)$/.test(code) && /\blots?\b|^f\d/i.test(m[0])) {
      return {
        text: `I don't see Lot ${code} on UTA's 2026–27 parking map. It may have been renumbered or closed. Open the official map to check:`,
        link: PARKING_MAP,
        linkLabel: "Open UTA's parking map (PDF)",
      };
    }
  }

  if (!PARKING_WORDS.test(text)) return null;
  const kind = permitKind(text);

  // "Closest student parking to Nedderman Hall"
  if (mentioned.length && mentioned[0].category !== "parking") {
    const target = mentioned[0];
    const pool = kind ? lotsFor(kind, buildings) : parking.filter((b) => b.lots?.length || /garage/i.test(b.name));
    const near = pool
      .map((b) => ({ b, d: metersBetween(b, target) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    if (near.length) {
      const what = kind ? `${PERMIT_LABEL[kind]} parking` : "parking";
      return placesReply(
        `Closest ${what} to ${target.name}:\n${near.map(({ b, d }) => `• ${b.name} (${b.note ? b.note.replace(/ required at all times.*$/, "").replace(/\.$/, "") : "parking"}), about ${walkMin(d)} min walk`).join("\n")}\nTap one to see it, then ➤ Get directions.`,
        near.map((n) => n.b),
        { link: PARKING_MAP, linkLabel: "Open UTA's parking map (PDF)", category: "parking" },
      );
    }
  }

  if (/\b(map|maps|pdf)\b/i.test(text)) {
    return {
      text: "UTA's official parking maps: the visitor map shows every numbered lot and garage, and the student commuter zones map shows which lots each commuter permit covers. In MavMap, open the Directory and pick Parking to see every lot by number.",
      link: PARKING_MAP,
      linkLabel: "Open UTA's parking map (PDF)",
      category: "parking",
    };
  }

  if (/\b(full|available|open spots?|space|spaces|real.?time|find a spot|parking finder)\b/i.test(text)) {
    return {
      text: "UTA's Parking Finder app shows live open spaces and how full each garage and lot is, plus EV charging spots. Search for “UTA Parking Finder” in your app store.",
      link: "https://www.uta.edu/news/news-releases/2023/08/16/uta-parking-app",
      linkLabel: "About the Parking Finder app",
    };
  }

  // "Where can students park?" / "faculty parking" / "visitor parking"
  if (kind) {
    const list = lotsFor(kind, buildings);
    const intro = {
      student:
        "Students with a UTA parking permit can use the student lots (numbered, like Lot 49) and the College Park North, Central and South garages plus the West Campus Garage. Since fall 2025, commuter permits are sold by zone, so check which lots your zone covers on the commuter zones map.",
      faculty: "Faculty and staff park in the F lots (F1 through F32) with an employee permit.",
      resident: "Residents park in the lot for their hall or apartments with a resident permit; some also use the College Park Central and South garages.",
      visitor:
        "No permit? Visitors pay by the hour (about $4 an hour, or $14 for the day on the 2026–27 visitor map) in the Maverick Parking Garage and the West Campus Garage. Visitors to the Dan Dipert Welcome Center, the Shops at College Park and the UTA Bookstore can get 2 hours free with validation.",
    }[kind];
    const shown = list.slice(0, 12);
    return placesReply(
      `${intro}\n${shown.map((b) => `• ${b.name}${b.address ? `, ${b.address.replace(/, Arlington, TX$/, "")}` : ""}`).join("\n")}${list.length > shown.length ? `\n…and ${list.length - shown.length} more in the Directory under Parking.` : ""}`,
      shown.slice(0, 4),
      { link: kind === "student" ? COMMUTER_MAP : PARKING_MAP, linkLabel: kind === "student" ? "Open the commuter zones map (PDF)" : "Open UTA's parking map (PDF)", category: "parking" },
    );
  }

  // General "where can I park?"
  if (/\b(where|how|can|park)\b/i.test(text) && /\bpark(ing)?\b/i.test(text)) {
    const counts = { student: 0, faculty: 0, resident: 0 };
    for (const b of parking) for (const k of b.permit || []) if (k in counts) counts[k] += 1;
    return placesReply(
      `UTA parking at a glance (permits are bought at uta.edu/parking):\n` +
        `• Students: ${counts.student} numbered student lots (24–56) plus the College Park North, Central and South garages and the West Campus Garage\n` +
        `• Faculty & staff: ${counts.faculty} F lots on the map\n` +
        `• Residents: the lot for your hall (KC, West Campus, University Village, Arbor Oaks, Meadow Run, Greek Row)\n` +
        `• Visitors: pay by the hour in the Maverick Parking Garage or West Campus Garage\n` +
        `Ask me “where is lot 49?” or “closest student parking to ERB”, or open the Directory → Parking.`,
      ["maverick-garage", "west-garage", "park-north"].map((id) => buildings.find((b) => b.id === id)),
      { link: "https://www.uta.edu/parking", linkLabel: "Open uta.edu/parking", category: "parking" },
    );
  }
  return null;
}

const APP_CONTEXT = /\b(app|mavmap|this map|the map|on the map|tab|menu|button|preferences|settings|screen|here|in this)\b|^\s*(how (do|can|would) (i|you)|how to|where do i|can i|is there a way)\b/i;
const EVENT_QUESTION =
  /\b(events?|happening|going on|workshops?|club meetings?|general meetings?|fairs?|festivals?|concerts?)\b|\b(what|anything|something)\b.*\b(to do|on campus)\b.*\b(this week|this weekend|tonight|today|tomorrow)\b/i;

function searchLink(text) {
  const words = normalize(text)
    .split(" ")
    .filter((w) => w && !STOP_WORDS.has(w) && !["find", "uta", "ut", "arlington", "campus", "have", "has", "there", "any", "does"].includes(w));
  const q = words.join(" ") || text.trim();
  return { link: utaSearchUrl(q), linkLabel: `Search uta.edu: ${q.length > 40 ? `${q.slice(0, 40)}…` : q}` };
}

function upcomingEvents(events, now) {
  return events
    .filter((e) => e.start && new Date(e.end || e.start) >= now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

/**
 * Upcoming events that match the question's words (plus a topic's own event words).
 * Returns the events; `.exact` on the array is true when the best one matches every word asked about.
 * titleOnly: only count events with a match in the title (for last-resort searches).
 */
export function searchEvents(text, events, extraWords = [], now = new Date(), limit = 4, { titleOnly = false } = {}) {
  const words = [...new Set(tokenize(text))].filter((t) => t.length >= 3 && !GENERIC.has(t) && !EVENT_WORDS.has(t));
  const extras = extraWords.map((w) => normalize(w)).filter(Boolean);
  if (!words.length && !extras.length) return [];
  const scored = [];
  for (const e of upcomingEvents(events, now)) {
    const title = ` ${normalize(e.title || "")} `;
    const types = ` ${normalize((e.types || []).join(" "))} `;
    const desc = ` ${normalize(e.description || "").slice(0, 600)} `;
    const titleTokens = new Set(tokenize(e.title || ""));
    const otherTokens = new Set(tokenize(`${(e.types || []).join(" ")} ${(e.description || "").slice(0, 600)}`));
    let score = 0;
    let matched = 0;
    let inTitle = false;
    for (const w of words) {
      if (titleTokens.has(w)) {
        score += 3;
        matched += 1;
        inTitle = true;
      } else if (otherTokens.has(w)) {
        score += 1;
        matched += 1;
      }
    }
    for (const x of extras) {
      if (title.includes(` ${x}`)) {
        score += 3;
        inTitle = true;
      } else if (types.includes(` ${x}`)) score += 2;
      else if (desc.includes(` ${x} `)) score += 1;
    }
    // One stray word in a long description isn't a match.
    if (score >= 2 && (!titleOnly || inTitle)) scored.push({ e, score, matched });
  }
  scored.sort((a, b) => b.score - a.score || new Date(a.e.start) - new Date(b.e.start));
  // A weekly event shows once (its next date), not once per week.
  const seenTitles = new Set();
  const unique = scored.filter((s) => {
    const key = normalize(s.e.title || "");
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  const out = unique.slice(0, limit).map((s) => s.e);
  out.exact = scored.length > 0 && (words.length === 0 || scored[0].matched === words.length);
  return out;
}

// Words that just mean "event" and shouldn't be matched against event titles.
const EVENT_WORDS = new Set(
  "event events happening going week weekend tonight today tomorrow upcoming soon any some there workshop meeting activities activity thing things"
    .split(" ")
    .map(stem),
);

function faqReply(faq, buildings, ranked) {
  const building = faq.building ? buildings.find((b) => b.id === faq.building) ?? null : null;
  const related = ranked
    .slice(1)
    .filter((r) => r.score >= 2)
    .map((r) => r.faq)
    .slice(0, 2);
  return { text: faq.answer, building, link: faq.link, suggestions: related, faqId: faq.id };
}
