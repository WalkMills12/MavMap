// Event timing helpers plus "add to calendar" for Google Calendar (link) and Apple Calendar (.ics file).

const pad = (n) => String(n).padStart(2, "0");

function utcStamp(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// All-day events use the campus calendar date written in the feed ("2026-11-14T00:00:00-06:00").
const datePart = (iso) => iso.slice(0, 10);
const compact = (ymd) => ymd.replaceAll("-", "");

function addDays(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function localDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Normalized timing for an event.
 * All-day: { allDay: true, startDay, endDayExclusive } as YYYY-MM-DD.
 * Timed:   { allDay: false, start: Date, end: Date } (end defaults to start + 1 hour).
 */
export function eventTimes(event) {
  if (event.all_day && event.start) {
    const startDay = datePart(event.start);
    const lastDay = datePart(event.end || event.start);
    return { allDay: true, startDay, endDayExclusive: addDays(lastDay < startDay ? startDay : lastDay, 1) };
  }
  const start = new Date(event.start);
  let end = event.end ? new Date(event.end) : null;
  if (!end || Number.isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
  return { allDay: false, start, end };
}

export function hasEnded(event, now = new Date()) {
  if (!event.start) return false;
  const t = eventTimes(event);
  if (t.allDay) return localDateKey(now) >= t.endDayExclusive;
  return t.end < now;
}

/** The day an event belongs under in the list. Multi-day events already running show under today. */
export function eventDayKey(event, now = new Date()) {
  const today = localDateKey(now);
  const t = eventTimes(event);
  const key = t.allDay ? t.startDay : localDateKey(t.start);
  return key < today ? today : key;
}

export function formatEventTime(event) {
  const t = eventTimes(event);
  if (t.allDay) {
    const days = Math.round((Date.parse(t.endDayExclusive) - Date.parse(t.startDay)) / 86400000);
    if (days <= 1) return "All day";
    const last = new Date(`${addDays(t.endDayExclusive, -1)}T12:00:00`);
    return `All day · through ${last.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
  }
  const opts = { hour: "numeric", minute: "2-digit" };
  return `${t.start.toLocaleTimeString(undefined, opts)} – ${t.end.toLocaleTimeString(undefined, opts)}`;
}

/** Card-sized version of a Localist event photo (the feed links the ~160 KB "huge" size). */
export function eventPhoto(event) {
  if (!event.photo_url) return null;
  return event.photo_url.replace("/huge/", "/big_300/");
}

export function eventLocation(event) {
  return [event.location, event.room && `Room ${event.room}`, event.address].filter(Boolean).join(", ");
}

function eventDetails(event) {
  return [event.description, event.url && `More info: ${event.url}`].filter(Boolean).join("\n\n");
}

export function googleCalendarUrl(event) {
  const t = eventTimes(event);
  const dates = t.allDay
    ? `${compact(t.startDay)}/${compact(t.endDayExclusive)}`
    : `${utcStamp(t.start)}/${utcStamp(t.end)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates,
    details: eventDetails(event),
    location: eventLocation(event),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function icsEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// RFC 5545 lines should stay under 75 characters; continuation lines start with a space.
function fold(line) {
  if (line.length <= 74) return line;
  const parts = [line.slice(0, 74)];
  for (let i = 74; i < line.length; i += 73) parts.push(` ${line.slice(i, i + 73)}`);
  return parts.join("\r\n");
}

export function buildIcs(event, now = new Date()) {
  const t = eventTimes(event);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MavMap//UTA Campus Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:mavmap-${event.id}@events.uta.edu`,
    `DTSTAMP:${utcStamp(now)}`,
    ...(t.allDay
      ? [`DTSTART;VALUE=DATE:${compact(t.startDay)}`, `DTEND;VALUE=DATE:${compact(t.endDayExclusive)}`]
      : [`DTSTART:${utcStamp(t.start)}`, `DTEND:${utcStamp(t.end)}`]),
    `SUMMARY:${icsEscape(event.title)}`,
  ];
  const location = eventLocation(event);
  if (location) lines.push(`LOCATION:${icsEscape(location)}`);
  const details = eventDetails(event);
  if (details) lines.push(`DESCRIPTION:${icsEscape(details)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  if (event.lat != null && event.lng != null) lines.push(`GEO:${event.lat};${event.lng}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Download an .ics file. Apple Calendar (and Outlook) open it and offer to add the event. */
export function downloadIcs(event) {
  // Prefer UTA's own .ics for the event (Localist), which Apple Calendar opens directly.
  if (event.ics_url) {
    const link = document.createElement("a");
    link.href = event.ics_url;
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.append(link);
    link.click();
    link.remove();
    return;
  }
  const blob = new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "uta-event";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
