import { useMemo, useState } from "react";
import { distanceMeters } from "../geo.js";
import {
  downloadIcs,
  eventDayKey,
  eventLocation,
  formatEventWhen,
  googleCalendarUrl,
  eventStartMs,
  hasEnded,
  isOngoing,
  liveStatus,
  localDateKey,
} from "../calendar.js";
import { recordInterest, recordTypeFilter } from "../interests.js";
import { badgeFor } from "../categories.js";
import { eventPhotoUrl } from "../photos.js";
import CardPhoto from "./CardPhoto.jsx";
import { similarEvents } from "../similar.js";

const UNTYPED = "__other";
const SAVED = "__saved";
const NEAR_BUILDING_M = 150;
const TYPE_CHIPS = 8; // type chips shown before "+ more"
const ONGOING = "~ongoing"; // sorts after every YYYY-MM-DD day key
// Events link to real buildings, not the cafes or garages next to them.
const LINKABLE = new Set(["academic", "student_life", "athletics", "recreation", "admin", "housing"]);

function agoLabel(stamp, now) {
  const s = Math.max(0, Math.round((now.getTime() - stamp) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  return m === 1 ? "1 min ago" : `${m} min ago`;
}

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
  updatedAt,
  now: nowMs,
}) {
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all"); // "all" | "uta" | "engage"
  const [allTypes, setAllTypes] = useState(false);
  const now = useMemo(() => (nowMs ? new Date(nowMs) : new Date()), [nowMs]);

  const allUpcoming = useMemo(() => events.filter((e) => e.start && !hasEnded(e, now)), [events, now]);
  const sourceCounts = useMemo(() => {
    const engage = allUpcoming.filter((e) => e.source === "MavEngage").length;
    return { all: allUpcoming.length, engage, uta: allUpcoming.length - engage };
  }, [allUpcoming]);
  const upcoming = useMemo(
    () =>
      sourceFilter === "all"
        ? allUpcoming
        : allUpcoming.filter((e) => (e.source === "MavEngage") === (sourceFilter === "engage")),
    [allUpcoming, sourceFilter],
  );
  const liveCount = useMemo(() => upcoming.filter((e) => liveStatus(e, now) === "live").length, [upcoming, now]);

  // Saved events that are still upcoming, including ones outside the current day range.
  const savedUpcoming = useMemo(() => {
    const live = new Map(upcoming.map((e) => [e.id, e]));
    return Object.values(savedEvents)
      .map((s) => live.get(s.id) || s)
      .filter((e) => e.start && !hasEnded(e, now));
  }, [savedEvents, upcoming, now]);

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
      return [e.title, e.location, e.description, e.host, ...(e.types || [])].join(" ").toLowerCase().includes(needle);
    });
    // Strict date/time order, day by day. Postings that began on an earlier day and are still
    // running (ticket sales, drives) go in their own "Ongoing" group at the end instead of
    // jumping the line at the top of today.
    const byDay = new Map();
    const ongoing = [];
    for (const e of filtered) {
      if (isOngoing(e, now)) {
        ongoing.push(e);
        continue;
      }
      const key = eventDayKey(e, now);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(e);
    }
    const byTime = (a, b) => eventStartMs(a) - eventStartMs(b) || a.title.localeCompare(b.title);
    for (const list of byDay.values()) list.sort(byTime);
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (ongoing.length) days.push([ONGOING, ongoing.sort(byTime)]);
    return days;
  }, [upcoming, savedUpcoming, type, query, now]);

  // "You may also like": upcoming events similar to the ones you saved.
  const savedList = useMemo(() => Object.values(savedEvents), [savedEvents]);
  const alsoLike = useMemo(
    () => (type === SAVED || query.trim() ? [] : similarEvents(savedList, allUpcoming, { now })),
    [savedList, allUpcoming, now, type, query],
  );

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
      <div className="source-switch" role="group" aria-label="Event source">
        {[
          ["all", "All", sourceCounts.all],
          ["uta", "UTA Events", sourceCounts.uta],
          ["engage", "MavEngage", sourceCounts.engage],
        ].map(([id, label, n]) => (
          <button key={id} type="button" aria-pressed={sourceFilter === id} onClick={() => setSourceFilter(id)}>
            {label} <span>{n}</span>
          </button>
        ))}
      </div>
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
        {(allTypes ? types : types.slice(0, TYPE_CHIPS)).map(([t, n]) => (
          <button key={t} type="button" className="filter-chip" aria-pressed={type === t} onClick={() => pickType(t)}>
            {t === UNTYPED ? "Other" : t} <span>{n}</span>
          </button>
        ))}
        {types.length > TYPE_CHIPS && (
          <button type="button" className="filter-chip filter-more" onClick={() => setAllTypes((v) => !v)} aria-expanded={allTypes}>
            {allTypes ? "Fewer" : `+ ${types.length - TYPE_CHIPS} more`}
          </button>
        )}
      </div>

      {loading && <p className="side-empty">Loading UTA and MavEngage events…</p>}
      {error && !loading && (
        <p className="side-empty side-error">Couldn't load campus events. Check that the backend is running, then reopen this tab.</p>
      )}
      {!loading && !error && (
        <p className="side-count events-live-line">
          <span className="live-dot" aria-hidden="true" />
          <span>
            Live
            {updatedAt ? ` · updated ${agoLabel(updatedAt, now)}` : ""}
            {liveCount > 0 ? ` · ${liveCount} happening now` : ""}
          </span>
          <span className="events-count">
            {shown} {shown === 1 ? "event" : "events"} in {rangeLabel}
          </span>
        </p>
      )}

      {alsoLike.length > 0 && (
        <section className="also-like" aria-label="You may also like">
          <h3 className="also-like-head">You may also like</h3>
          <ul className="also-like-row">
            {alsoLike.map(({ event: e, because, reasons }) => {
              const fav = isEventFav(e.id);
              return (
                <li key={e.id} className="also-card">
                  <CardPhoto src={eventPhotoUrl(e)} fallbackLabel={e.types?.[0] || "UTA"} className="also-photo">
                    <button
                      type="button"
                      className={`star-toggle card-star${fav ? " is-on" : ""}`}
                      aria-pressed={fav}
                      aria-label={fav ? `Remove ${e.title} from saved events` : `Save ${e.title}`}
                      onClick={() => toggleSave(e)}
                    >
                      {fav ? "★" : "☆"}
                    </button>
                  </CardPhoto>
                  <div className="also-body">
                    <p className="also-when">{formatEventWhen(e, now)}</p>
                    <p className="also-title">
                      {e.url ? (
                        <a href={e.url} target="_blank" rel="noreferrer" onClick={() => recordInterest(e, "open")}>
                          {e.title}
                        </a>
                      ) : (
                        e.title
                      )}
                    </p>
                    <p className="also-why">
                      Because you saved “{because.title}”{reasons[0] ? ` · ${reasons[0]}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {groups.map(([day, list]) => (
        <section key={day} className="event-day">
          <h3 className="event-day-head">{day === ONGOING ? "Ongoing" : dayHeading(day, now)}</h3>
          <ul className="event-list">
            {list.map((e) => {
              const building = nearestBuilding(e);
              const where = eventLocation(e);
              const fav = isEventFav(e.id);
              const live = liveStatus(e, now);
              return (
                <li key={e.id} className={`event-card has-photo${live === "live" ? " is-live" : ""}`}>
                  <CardPhoto src={eventPhotoUrl(e)} fallbackLabel={e.types?.[0] || "UTA"} className="event-photo">
                    {live && (
                      <span className={`live-badge live-badge--${live}`}>
                        {live === "live" ? "● Live now" : "Starting soon"}
                      </span>
                    )}
                    <span className="card-caption">
                      <span className="card-eyebrow">{formatEventWhen(e, now)}</span>
                    </span>
                    <button
                      type="button"
                      className={`star-toggle card-star${fav ? " is-on" : ""}`}
                      aria-pressed={fav}
                      aria-label={fav ? `Remove ${e.title} from saved events` : `Save ${e.title}`}
                      title={fav ? "Saved" : "Save"}
                      onClick={() => toggleSave(e)}
                    >
                      {fav ? "★" : "☆"}
                    </button>
                  </CardPhoto>
                  <div className="event-card-body">
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
                  <p className="event-source">
                    <span className={`source-tag${e.source === "MavEngage" ? " is-engage" : ""}`}>
                      {e.source === "MavEngage" ? "MavEngage" : "UTA Events"}
                    </span>
                    {e.host && <span className="event-host">{e.host}</span>}
                  </p>
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
