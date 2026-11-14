function toGoogleCalendarStamp(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Prefer Localist .ics (Apple/Google/Outlook). Fall back to Google Calendar template. */
export function calendarLinks(event) {
  const ics = event.ics_url || null;

  const start = toGoogleCalendarStamp(event.start);
  let end = toGoogleCalendarStamp(event.end);
  if (start && !end) {
    const fallback = new Date(new Date(event.start).getTime() + 2 * 60 * 60 * 1000);
    end = toGoogleCalendarStamp(fallback.toISOString());
  }

  let google = null;
  if (start && end) {
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title || "UTA Event",
      dates: `${start}/${end}`,
      details: event.url || "From MavMap · events.uta.edu",
      location: event.location || "University of Texas at Arlington",
    });
    google = `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  return { ics, google };
}
