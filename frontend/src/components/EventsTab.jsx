import { useMemo, useState } from "react";
import { distanceMeters } from "../geo.js";
import {
  downloadIcs,
  eventDayKey,
  eventLocation,
  formatEventTime,
  googleCalendarUrl,
  hasEnded,
  localDateKey,
} from "../calendar.js";
import { recordInterest, recordTypeFilter } from "../interests.js";
import { badgeFor } from "../categories.js";

const UNTYPED = "__other";
const SAVED = "__saved";
const NEAR_BUILDING_M = 150;
// Events link to real buildings, not the cafes or garages next to them.
const LINKABLE = new Set(["academic", "student_life", "athletics", "admin", "housing"]);

function dayHeading(key, now) {
  const today = localDateKey(now);
  const tomorrow = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function EventsTab({
  events,
  loading,
  error,
  days,
  calendarPref,
  buildings,
  onShowBuilding,
  savedEvents,
  isEventFav,
  onToggleFavorite,
}) {
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const now = new Date();

  const upcoming = useMemo(() => events.filter((e) => e.start && !hasEnded(e)), [events]);

  // Saved events that are still upcoming, including ones outside the current day range.
  const savedUpcoming = useMemo(() => {
    const live = new Map(upcoming.map((e) => [e.id, e]));
    return Object.values(savedEvents)
      .map((s) => live.get(s.id) || s)
      .filter((e) => e.start && !hasEnded(e));
  }, [savedEvents, upcoming]);

  const types = useMemo(() => {
    const counts = new Map();
    let untyped = 0;
    for (const e of upcoming) {
      if (!e.types?.length) untyped += 1;
      for (const t of e.types || []) counts.set(t, (counts.get(t) || 0) + 1);
    }
    const list = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (untyped) list.push([UNTYPED, untyped]);
    return list;
  }, [upcoming]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = type === SAVED ? savedUpcoming : upcoming;
    const filtered = source.filter((e) => {
      if (type === UNTYPED && e.types?.length) return false;
      if (type !== "all" && type !== UNTYPED && type !== SAVED && !(e.types || []).includes(type)) return false;
      if (!needle) return true;
      return [e.title, e.location, e.description, ...(e.types || [])].join(" ").toLowerCase().includes(needle);
    });
    const byDay = new Map();
    for (const e of filtered) {
      const key = eventDayKey(e);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(e);
    }
    for (const list of byDay.values()) {
      list.sort((a, b) => Number(b.all_day) - Number(a.all_day) || (a.start || "").localeCompare(b.start || ""));
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [upcoming, savedUpcoming, type, query]);

  const nearestBuilding = (e) => {
    if (e.lat == null || e.lng == null) return null;
    let best = null;
    for (const b of buildings) {
      if (!LINKABLE.has(b.category)) continue;
      const d = distanceMeters({ lat: e.lat, lng: e.lng }, b);
      if (d <= NEAR_BUILDING_M && (!best || d < best.d)) best = { b, d };
    }
    return best?.b ?? null;
  };

  const pickType = (t) => {
    setType(t);
    if (t !== "all" && t !== SAVED && t !== UNTYPED) recordTypeFilter(t);
  };

  const toggleSave = (e) => {
    const nowSaved = onToggleFavorite(e);
    recordInterest(e, nowSaved ? "favorite" : "unfavorite");
  };

  const shown = groups.reduce((n, [, list]) => n + list.length, 0);
  const rangeLabel = type === SAVED ? "your saved list" : days === 1 ? "today" : `the next ${days} days`;

  return (
    <div className="side-section">
      <input
        className="side-search"
        type="search"
        placeholder="Search events"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search events"
      />
      <div className="filter-chips" role="group" aria-label="Event type">
        <button type="button" className="filter-chip" aria-pressed={type === "all"} onClick={() => pickType("all")}>
          All <span>{upcoming.length}</span>
        </button>
        <button
          type="button"
          className="filter-chip cat-favorites"
          aria-pressed={type === SAVED}
          onClick={() => pickType(SAVED)}
        >
          ★ Saved <span>{savedUpcoming.length}</span>
        </button>
        {types.map(([t, n]) => (
          <button key={t} type="button" className="filter-chip" aria-pressed={type === t} onClick={() => pickType(t)}>
            {t === UNTYPED ? "Other" : t} <span>{n}</span>
          </button>
        ))}
      </div>

      {loading && <p className="side-empty">Loading UTA events…</p>}
      {error && !loading && (
        <p className="side-empty side-error">Couldn't load events from events.uta.edu. Check that the backend is running, then reopen this tab.</p>
      )}
      {!loading && !error && (
        <p className="side-count">
          {shown} {shown === 1 ? "event" : "events"} in {rangeLabel}
        </p>
      )}

      {groups.map(([day, list]) => (
        <section key={day} className="event-day">
          <h3 className="event-day-head">{dayHeading(day, now)}</h3>
          <ul className="event-list">
            {list.map((e) => {
              const building = nearestBuilding(e);
              const where = eventLocation(e);
              const fav = isEventFav(e.id);
              return (
                <li key={e.id} className="event-card">
                  <div className="event-card-top">
                    <p className="event-time">{formatEventTime(e)}</p>
                    <button
                      type="button"
                      className={`star-toggle${fav ? " is-on" : ""}`}
                      aria-pressed={fav}
                      aria-label={fav ? `Remove ${e.title} from saved events` : `Save ${e.title}`}
                      title={fav ? "Saved" : "Save"}
                      onClick={() => toggleSave(e)}
                    >
                      {fav ? "★" : "☆"}
                    </button>
                  </div>
                  <h4 className="event-title">
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer" onClick={() => recordInterest(e, "open")}>
                        {e.title}
                      </a>
                    ) : (
                      e.title
                    )}
                  </h4>
                  {where && <p className="event-where">{where}</p>}
                  {e.types?.length > 0 && (
                    <p className="event-types">
                      {e.types.map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </p>
                  )}
                  {e.description && <p className="event-desc">{e.description}</p>}
                  <div className="event-actions">
                    {calendarPref !== "apple" && (
                      <a
                        className="cal-btn"
                        href={googleCalendarUrl(e)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => recordInterest(e, "calendar")}
                      >
                        + Google Calendar
                      </a>
                    )}
                    {calendarPref !== "google" && (
                      <button
                        type="button"
                        className="cal-btn"
                        onClick={() => {
                          downloadIcs(e);
                          recordInterest(e, "calendar");
                        }}
                      >
                        + Apple Calendar
                      </button>
                    )}
                    {building && (
                      <button type="button" className="cal-btn ghost" onClick={() => onShowBuilding(building)}>
                        Show {badgeFor(building)} on map
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!loading && !error && shown === 0 && (
        <p className="side-empty">
          {type === SAVED
            ? "No saved events coming up. Tap ☆ on an event to save it."
            : "No events match. Pick another type, or show more days in Preferences."}
        </p>
      )}
    </div>
  );
}
