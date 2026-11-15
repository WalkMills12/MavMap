// Class schedule: parse a schedule (PDF text or pasted text) into classes, store them in this browser,
// and work out the next class. Parsing happens on this device; the PDF is never uploaded anywhere.
import { useCallback, useEffect, useState } from "react";
import { findBuilding, findRoom, floorOf } from "./faqMatch.js";

const STORAGE_KEY = "mavmap.schedule.v1";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_LETTERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_TOKEN = /Mo|Tu|We|Th|Fr|Sa|Su|M|T|W|R|F|S|U/g;
const DAY_INDEX = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };

// "MoWe 1:00PM - 2:20PM", "TTh 9:30-10:50 AM", "MWF 11:00 am to 11:50 am"
const MEETING = /(?:^|[^A-Za-z])((?:Mo|Tu|We|Th|Fr|Sa|Su|M|T|W|R|F|S|U){1,7})\s*,?\s+(\d{1,2}:\d{2})\s*([AaPp]\.?[Mm]\.?)?\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2})\s*([AaPp]\.?[Mm]\.?)/;
// "CSE 1310-001", "MATH1426", "ENGL 1301 - 002"
const COURSE_WITH_SECTION = /\b([A-Z]{2,5})\s?-?\s?(\d{4})\s?-\s?(\d{3})\b/;
const COURSE = /\b([A-Z]{2,5})\s?(\d{4})\b/;
const COMPONENT = /\b(Lecture|Laboratory|Lab|Discussion|Seminar|Recitation|Studio|Lec|Dis|Sem|Rec)\b/i;
const ONLINE = /\b(online|web[- ]based|internet|remote|synchronous|asynchronous|zoom|teams)\b/i;

export function parseDays(token) {
  const days = new Set();
  for (const t of String(token).match(DAY_TOKEN) || []) days.add(DAY_INDEX[t]);
  return [...days].sort((a, b) => a - b);
}

function toMinutes(hm, meridiem) {
  let [h, m] = hm.split(":").map(Number);
  const pm = /p/i.test(meridiem || "");
  if (meridiem) {
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return h * 60 + m;
}

/** "13:05" style minutes → "1:05 PM". */
export function formatMinutes(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function formatDays(days) {
  return days.map((d) => DAY_LETTERS[d]).join(" ");
}

function parseMeeting(line) {
  const m = line.match(MEETING);
  if (!m) return null;
  const days = parseDays(m[1]);
  if (!days.length) return null;
  const end = toMinutes(m[4], m[5]);
  // "9:30-10:50 AM": the start shares the end's AM/PM unless that would put it after the end.
  let start = toMinutes(m[2], m[3] || m[5]);
  if (!m[3] && start > end) start = toMinutes(m[2], /p/i.test(m[5]) ? "am" : "pm");
  if (end <= start) return null;
  const index = m.index + m[0].indexOf(m[1]);
  return { days, start, end, index, after: line.slice(m.index + m[0].length), before: line.slice(0, index) };
}

/** The building codes MavMap knows, upper-case (to tell "ERB 129" rooms from "CSE 1310" courses). */
function buildingCodes(buildings) {
  const set = new Set();
  for (const b of buildings) for (const a of b.abbr || []) set.add(a.toUpperCase());
  return set;
}

function findCourse(line, codes) {
  const withSection = line.match(COURSE_WITH_SECTION);
  if (withSection) return { course: `${withSection[1]} ${withSection[2]}`, section: withSection[3], index: withSection.index, length: withSection[0].length };
  const re = new RegExp(COURSE.source, "g");
  for (const m of line.matchAll(re)) {
    if (codes.has(m[1])) continue; // that's a building and room number, not a course
    return { course: `${m[1]} ${m[2]}`, section: "", index: m.index, length: m[0].length };
  }
  return null;
}

/** Find the building and room in a bit of schedule text ("ERB 129", "Nedderman Hall 00106", "Online"). */
export function locate(text, buildings) {
  if (!text) return null;
  // MyMav pads room numbers with zeros ("NH 00106").
  const cleaned = text.replace(/\b([A-Za-z]{2,10})\s*0+(\d{2,4}[A-Za-z]?)\b/g, "$1 $2");
  const room = findRoom(cleaned, buildings);
  if (room) return { buildingId: room.building.id, room: room.room };
  const building = findBuilding(cleaned, buildings);
  if (building) {
    const idx = cleaned.toLowerCase().indexOf(building.name.toLowerCase());
    const tail = idx >= 0 ? cleaned.slice(idx + building.name.length) : cleaned;
    const num = tail.match(/^\s*(?:room|rm\.?|#)?\s*(B?\d{2,4}[A-Z]?)\b/i);
    return { buildingId: building.id, room: num ? num[1].toUpperCase() : "" };
  }
  if (ONLINE.test(text)) return { online: true };
  return null;
}

let idCounter = 0;
const newId = () => `c${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/**
 * Turn schedule text into classes. Works line by line: a course code sets the current course,
 * each "days + times" meeting becomes a class, and the building/room is looked for on the same line
 * and the next couple of lines.
 */
export function parseScheduleText(text, buildings) {
  const codes = buildingCodes(buildings);
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const classes = [];
  let current = null; // { course, section, title }
  let component = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const meeting = parseMeeting(line);
    const course = findCourse(meeting ? meeting.before : line, codes);
    if (course) {
      const rest = (meeting ? meeting.before : line).slice(course.index + course.length);
      const title = rest
        .replace(COMPONENT, "")
        .replace(/^[\s\-–:|,]+/, "")
        .replace(/\s+[-–|].*$/, "")
        .replace(/\b(Enrolled|Waitlisted|Dropped|Open|Closed)\b.*$/i, "")
        .trim();
      current = { course: course.course, section: course.section, title: title.length > 2 && !/^\d/.test(title) ? title.slice(0, 70) : "" };
      component = "";
    } else if (current && !current.title && !meeting && /^[A-Za-z][A-Za-z &,:'/-]{3,70}$/.test(line) && !COMPONENT.test(line) && !locate(line, buildings)) {
      current.title = line; // a title printed on the line after the course code
    }
    const comp = line.match(COMPONENT);
    if (comp) component = comp[1];
    if (!meeting) continue;

    // Where: on this line after the times, otherwise on the next lines (before the next meeting).
    let where = locate(meeting.after, buildings);
    for (let j = i + 1; !where && j < Math.min(lines.length, i + 3); j++) {
      if (parseMeeting(lines[j]) || findCourse(lines[j], codes)) break;
      where = locate(lines[j], buildings);
    }
    if (!where) where = locate(meeting.before.slice(course ? course.index + course.length : 0), buildings);

    classes.push({
      id: newId(),
      course: current?.course || "Class",
      section: current?.section || "",
      title: current?.title || "",
      component: normalizeComponent(component),
      days: meeting.days,
      start: meeting.start,
      end: meeting.end,
      buildingId: where?.buildingId || "",
      room: where?.room || "",
      online: Boolean(where?.online),
    });
  }

  // The same meeting printed twice (for example on a list page and a calendar page) only counts once.
  const seen = new Set();
  return classes.filter((c) => {
    const key = `${c.course}|${c.days.join("")}|${c.start}|${c.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeComponent(c) {
  const v = String(c || "").toLowerCase();
  if (!v) return "";
  if (v.startsWith("lec")) return "Lecture";
  if (v.startsWith("lab")) return "Lab";
  if (v.startsWith("dis")) return "Discussion";
  if (v.startsWith("sem")) return "Seminar";
  if (v.startsWith("rec")) return "Recitation";
  return c[0].toUpperCase() + c.slice(1).toLowerCase();
}

/** Read the text out of a PDF, keeping its lines (grouped by height on the page). */
export async function pdfToText(file) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = [];
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x, w: item.width || 0, str: item.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let line = "";
      let lastEnd = null;
      for (const it of r.items) {
        // A wide gap between pieces is a new column: keep it as a separator.
        if (lastEnd != null) line += it.x - lastEnd > 12 ? "  |  " : it.x - lastEnd > 1 ? " " : "";
        line += it.str;
        lastEnd = it.x + it.w;
      }
      out.push(line);
    }
  }
  return out.join("\n");
}

/** When each class next starts (or is happening now). Returns the soonest, or null. */
export function nextClass(classes, now = new Date()) {
  let best = null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const c of classes) {
    for (let offset = 0; offset < 8; offset++) {
      const day = (now.getDay() + offset) % 7;
      if (!c.days.includes(day)) continue;
      if (offset === 0 && c.end <= nowMin) continue; // already over today
      const startsAt = new Date(now);
      startsAt.setDate(now.getDate() + offset);
      startsAt.setHours(Math.floor(c.start / 60), c.start % 60, 0, 0);
      const inProgress = offset === 0 && c.start <= nowMin;
      if (!best || startsAt < best.startsAt) best = { cls: c, startsAt, inProgress };
      break;
    }
  }
  return best;
}

/** "Today", "Tomorrow" or the weekday. */
export function dayLabel(date, now = new Date()) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long" });
}

export function describeLocation(cls, buildings) {
  if (cls.online) return "Online";
  const b = buildings.find((x) => x.id === cls.buildingId);
  if (!b) return "Building not set";
  const code = b.abbr?.[0];
  if (!cls.room) return b.name;
  return `${code ? `${code} ${cls.room}` : `${b.name} ${cls.room}`} · ${floorOf(cls.room)}`;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((c) => Array.isArray(c.days) && Number.isFinite(c.start)) : [];
  } catch {
    return [];
  }
}

/** The student's classes, saved in this browser only. */
export function useSchedule() {
  const [classes, setClasses] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(classes));
    } catch {
      // Storage blocked: the schedule lasts until the page closes.
    }
  }, [classes]);
  const add = useCallback((items) => setClasses((cur) => [...cur, ...(Array.isArray(items) ? items : [items]).map((c) => ({ ...c, id: c.id || newId() }))]), []);
  const update = useCallback((id, patch) => setClasses((cur) => cur.map((c) => (c.id === id ? { ...c, ...patch } : c))), []);
  const remove = useCallback((id) => setClasses((cur) => cur.filter((c) => c.id !== id)), []);
  const replaceAll = useCallback((items) => setClasses(items), []);
  return { classes, add, update, remove, replaceAll };
}
